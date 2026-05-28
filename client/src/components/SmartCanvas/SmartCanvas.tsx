// ---------------------------------------------------------------------------
//  SmartCanvas.tsx — Main React component for the node-graph smart canvas
//
//  Architecture:
//   - shell div: full screen, captures mouse/keyboard for pan/zoom/selection
//   - world div: CSS-transformed child (translate + scale) via ViewportManager
//   - SmartNode components rendered at absolute positions inside world
//   - ConnectionLayer SVG overlay for bezier connections
//   - Minimap in bottom-right corner
//   - Floating context menu on right-click for node creation
//   - Rubber-band selection rectangle overlay
// ---------------------------------------------------------------------------

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { ViewportManager } from './core/ViewportManager'
import { InteractionManager } from './core/InteractionManager'
import { ConnectionManager } from './connections/ConnectionManager'
import ConnectionLayer from './connections/ConnectionLayer'
import type { WipConnection } from './connections/ConnectionLayer'
import SmartImageNode from './nodes/SmartImageNode'
import SmartPromptNode from './nodes/SmartPromptNode'
import SmartLoopNode from './nodes/SmartLoopNode'
import { Minimap } from './ui/Minimap'
import CanvasPromptBar from './prompt/CanvasPromptBar'
import AssetLibrary from '../AssetLibrary/AssetLibrary'
import { useSmartCanvasStore } from './CanvasState'
import { getElectronAPI, type IpcTaskStatus } from '../../api/ipcBridge'
import { useGenerationStore } from '../../store/generationStore'
import type { SmartNode, SmartNodeType, Viewport, NodeImage } from './types'
import { uid } from './types'

// -- Props -------------------------------------------------------------------

interface SmartCanvasProps {
  onClose: () => void
}

// -- Context menu state ------------------------------------------------------

interface ContextMenu {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

// -- Node creation menu items ------------------------------------------------

const NODE_MENU_ITEMS: Array<{ type: SmartNodeType; label: string; color: string }> = [
  { type: 'smart-image', label: 'Image Node', color: '#6366f1' },
  { type: 'smart-prompt', label: 'Prompt Node', color: '#10b981' },
  { type: 'smart-loop', label: 'Loop Node', color: '#f59e0b' },
]

// -- Component ---------------------------------------------------------------

const SmartCanvas: React.FC<SmartCanvasProps> = ({ onClose }) => {
  // Refs for DOM elements
  const shellRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)

  // Manager refs (instantiated once on mount)
  const vmRef = useRef<ViewportManager | null>(null)
  const imRef = useRef<InteractionManager | null>(null)
  const cmRef = useRef<ConnectionManager | null>(null)

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // React state
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, scale: 1 })
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [wipConnection, setWipConnection] = useState<WipConnection | null>(null)
  const [shellRect, setShellRect] = useState<DOMRect | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [activeTaskIds, setActiveTaskIds] = useState<Set<string>>(() => new Set())

  // Zustand store
  const nodes = useSmartCanvasStore(s => s.nodes)
  const connections = useSmartCanvasStore(s => s.connections)
  const selectedIds = useSmartCanvasStore(s => s.selectedIds)
  const canvasName = useSmartCanvasStore(s => s.canvasName)

  const addNode = useSmartCanvasStore(s => s.addNode)
  const removeNode = useSmartCanvasStore(s => s.removeNode)
  const removeNodes = useSmartCanvasStore(s => s.removeNodes)
  const updateNode = useSmartCanvasStore(s => s.updateNode)
  const updateNodes = useSmartCanvasStore(s => s.updateNodes)
  const storeSetViewport = useSmartCanvasStore(s => s.setViewport)
  const setSelectedIds = useSmartCanvasStore(s => s.setSelectedIds)
  const pushUndo = useSmartCanvasStore(s => s.pushUndo)
  const undo = useSmartCanvasStore(s => s.undo)
  const addConnection = useSmartCanvasStore(s => s.addConnection)
  const removeConnection = useSmartCanvasStore(s => s.removeConnection)
  const loadDocument = useSmartCanvasStore(s => s.loadDocument)
  const setCanvasList = useSmartCanvasStore(s => s.setCanvasList)
  const generationSettings = useGenerationStore()

  // -- Selection box from InteractionManager ---------------------------------

  const [selectionBox, setSelectionBox] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  // -- Initialize managers on mount ------------------------------------------

  useEffect(() => {
    const shell = shellRef.current
    const world = worldRef.current
    if (!shell || !world) return

    // ViewportManager
    const vm = new ViewportManager(shell, world)
    vmRef.current = vm

    vm.onChange = (vp: Viewport) => {
      setViewportState(vp)
      storeSetViewport(vp)
    }

    // InteractionManager
    const im = new InteractionManager()
    imRef.current = im

    im.onChange = () => {
      setSelectedIds(im.getSelected())
      setSelectionBox(im.getSelectionBox())
    }

    im.onNodesUpdate = updates => {
      updateNodes(updates)
    }

    im.onNodesPaste = (pastedNodes, pastedConnections) => {
      for (const n of pastedNodes) {
        addNode(n.type, n.x, n.y, n)
      }
      for (const c of pastedConnections) {
        addConnection(c.from, c.to)
      }
    }

    im.onDeleteNodes = ids => {
      pushUndo()
      removeNodes(ids)
    }

    im.onUndo = () => {
      undo()
    }

    im.onUndoPush = () => {
      pushUndo()
    }

    // ConnectionManager
    const connMgr = new ConnectionManager()
    cmRef.current = connMgr

    // Update shell rect for minimap
    setShellRect(shell.getBoundingClientRect())
    const resizeObserver = new ResizeObserver(() => {
      setShellRect(shell.getBoundingClientRect())
    })
    resizeObserver.observe(shell)

    // Load canvas from IPC on mount
    const api = getElectronAPI()
    if (api) {
      api
        .canvasList()
        .then(list => {
          setCanvasList(list.map(l => ({ id: l.id, name: l.name, updatedAt: l.updatedAt })))
        })
        .catch(err => console.warn('[SmartCanvas] Failed to load canvas list:', err))

      // Load the most recent canvas or a specific one
      const targetId = useSmartCanvasStore.getState().canvasId
      if (targetId) {
        api
          .canvasLoad(targetId)
          .then(doc => {
            if (doc) {
              loadDocument({
                id: doc.id,
                name: doc.name,
                nodes: (doc.metadata?.smartNodes as SmartNode[]) ?? [],
                connections:
                  (doc.metadata?.smartConnections as Array<{
                    from: string
                    to: string
                    kind: 'flow' | 'input'
                  }>) ?? [],
                viewport: {
                  x: doc.viewport?.x ?? 0,
                  y: doc.viewport?.y ?? 0,
                  scale: doc.viewport?.zoom ?? 1,
                },
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
              })
              vm.setViewport({
                x: doc.viewport?.x ?? 0,
                y: doc.viewport?.y ?? 0,
                scale: doc.viewport?.zoom ?? 1,
              })
            }
          })
          .catch(err => console.warn('[SmartCanvas] Failed to load canvas:', err))
      } else {
        // Generate a unique canvas ID for new canvases
        const newId = uid('canvas')
        useSmartCanvasStore.getState().setCanvas(newId, 'Untitled')
      }
    } else {
      // No Electron API — still ensure a canvas ID exists
      if (!useSmartCanvasStore.getState().canvasId) {
        const newId = uid('canvas')
        useSmartCanvasStore.getState().setCanvas(newId, 'Untitled')
      }
    }

    // Auto-save every 30 seconds (only when canvasId is set)
    saveTimerRef.current = setInterval(() => {
      const electronApi = getElectronAPI()
      if (!electronApi) return
      const state = useSmartCanvasStore.getState()
      if (!state.canvasId) return
      const doc = state.serialize()
      electronApi
        .canvasSave({
          id: doc.id,
          name: doc.name,
          createdAt: doc.createdAt || Date.now(),
          updatedAt: Date.now(),
          viewport: { x: doc.viewport.x, y: doc.viewport.y, zoom: doc.viewport.scale },
          objects: [],
          metadata: {
            smartNodes: doc.nodes,
            smartConnections: doc.connections,
          },
        })
        .catch(err => console.warn('[SmartCanvas] Auto-save failed:', err))
    }, 30_000)

    return () => {
      vm.dispose()
      im.dispose()
      resizeObserver.disconnect()
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- API task event binding -------------------------------------------------

  useEffect(() => {
    const api = getElectronAPI()
    if (!api) return

    return api.onTaskEvent((channel, data: IpcTaskStatus) => {
      const currentNodes = useSmartCanvasStore.getState().nodes
      const target = currentNodes.find(node => node.generationTaskId === data.taskId)
      if (!target) return

      if (channel === 'task:progress' || channel === 'task:started') {
        updateNode(target.id, {
          running: true,
          pending: Math.max(1, Math.round(data.progress || 0)),
        })
      }

      if (channel === 'task:completed' && data.result?.images?.length) {
        const images: NodeImage[] = data.result.images.map((image, index) => {
          let url = image.data
          if (image.format === 'base64' && !url.startsWith('data:')) {
            url = `data:image/png;base64,${url}`
          } else if (image.format === 'localPath') {
            url = `file://${url}`
          }
          return {
            url,
            name: `generated-${index + 1}.png`,
            kind: 'generated',
            naturalWidth: image.width,
            naturalHeight: image.height,
          }
        })

        updateNode(target.id, {
          images: [...target.images, ...images],
          running: false,
          pending: 0,
          title: 'Generated',
          runFinishedAt: Date.now(),
        })

        const api = getElectronAPI()
        images.forEach(image => {
          api
            ?.assetsImport({
              data: image.url,
              prompt: target.title,
              model: data.result?.metadata?.model,
              width: image.naturalWidth,
              height: image.naturalHeight,
              tags: ['generated', 'canvas'],
            })
            .catch(err => console.warn('[SmartCanvas] Asset auto-import failed:', err))
        })
        setActiveTaskIds(prev => {
          const next = new Set(prev)
          next.delete(data.taskId)
          return next
        })
      }

      if (channel === 'task:failed' || channel === 'task:cancelled') {
        updateNode(target.id, {
          running: false,
          pending: 0,
          title: channel === 'task:failed' ? `${target.title} (failed)` : target.title,
        })
        setActiveTaskIds(prev => {
          const next = new Set(prev)
          next.delete(data.taskId)
          return next
        })
      }
    })
  }, [updateNode])

  // -- Global keyboard handler -----------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const im = imRef.current
      if (!im) return

      // Let InteractionManager handle it with current nodes and connections
      const state = useSmartCanvasStore.getState()
      im.handleKeyDown(e, state.nodes, state.connections)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // -- Shell mouse handlers --------------------------------------------------

  const handleShellMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setContextMenu(null)

    const vm = vmRef.current
    const im = imRef.current
    if (!vm || !im) return

    const world = vm.screenToWorld(e.clientX, e.clientY)
    im.handleShellMouseDown(world.x, world.y, e.shiftKey)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const vm = vmRef.current
      const im = imRef.current
      if (!vm || !im) return

      const world = vm.screenToWorld(e.clientX, e.clientY)
      const currentNodes = useSmartCanvasStore.getState().nodes
      im.handleMouseMove(world.x, world.y, currentNodes)

      // Update WIP connection position
      if (wipConnection) {
        setWipConnection(prev => (prev ? { ...prev, mouseX: world.x, mouseY: world.y } : null))
      }
    },
    [wipConnection],
  )

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      const im = imRef.current
      if (!im) return

      const currentNodes = useSmartCanvasStore.getState().nodes
      im.handleMouseUp(currentNodes)

      // Finalize WIP connection
      if (wipConnection) {
        setWipConnection(null)
      }
    },
    [wipConnection],
  )

  // -- Context menu ----------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const vm = vmRef.current
    if (!vm) return

    const world = vm.screenToWorld(e.clientX, e.clientY)
    setContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      worldX: world.x,
      worldY: world.y,
    })
  }, [])

  const handleCreateNode = useCallback(
    (type: SmartNodeType) => {
      if (!contextMenu) return
      pushUndo()
      addNode(type, contextMenu.worldX, contextMenu.worldY)
      setContextMenu(null)
    },
    [contextMenu, pushUndo, addNode],
  )

  const dismissContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // -- Node interaction callbacks --------------------------------------------

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setContextMenu(null)

    const vm = vmRef.current
    const im = imRef.current
    if (!vm || !im) return

    const world = vm.screenToWorld(e.clientX, e.clientY)
    const currentNodes = useSmartCanvasStore.getState().nodes
    im.handleNodeMouseDown(nodeId, world.x, world.y, e.shiftKey, currentNodes)
  }, [])

  const handleResizeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()

    const vm = vmRef.current
    const im = imRef.current
    if (!vm || !im) return

    const world = vm.screenToWorld(e.clientX, e.clientY)
    const node = useSmartCanvasStore.getState().nodes.find(n => n.id === nodeId)
    if (!node) return

    im.handleResizeMouseDown(nodeId, world.x, world.y, node)
  }, [])

  const handleNodeUpdate = useCallback(
    (id: string, patch: Partial<SmartNode>) => {
      updateNode(id, patch)
    },
    [updateNode],
  )

  const handleDeleteNode = useCallback(
    (id: string) => {
      pushUndo()
      removeNode(id)
    },
    [pushUndo, removeNode],
  )

  // -- Port drag (WIP connection) --------------------------------------------

  const handlePortMouseDown = useCallback(
    (nodeId: string, portType: 'input' | 'output', e: React.MouseEvent) => {
      e.stopPropagation()
      if (portType !== 'output') return

      const vm = vmRef.current
      if (!vm) return

      const world = vm.screenToWorld(e.clientX, e.clientY)
      setWipConnection({
        fromId: nodeId,
        fromPort: 'output',
        mouseX: world.x,
        mouseY: world.y,
      })

      // We need to track mouse globally until mouseup to detect port drop
      const handleGlobalMove = (me: MouseEvent) => {
        const w = vm.screenToWorld(me.clientX, me.clientY)
        setWipConnection(prev => (prev ? { ...prev, mouseX: w.x, mouseY: w.y } : null))
      }

      const handleGlobalUp = (me: MouseEvent) => {
        window.removeEventListener('mousemove', handleGlobalMove)
        window.removeEventListener('mouseup', handleGlobalUp)

        // Check if we dropped on an input port
        const target = me.target as HTMLElement
        const portEl = target.closest('[data-port-type="input"]') as HTMLElement | null
        if (portEl) {
          const targetNodeId = portEl.getAttribute('data-node-id')
          if (targetNodeId && targetNodeId !== nodeId) {
            pushUndo()
            addConnection(nodeId, targetNodeId)
          }
        }

        setWipConnection(null)
      }

      window.addEventListener('mousemove', handleGlobalMove)
      window.addEventListener('mouseup', handleGlobalUp)
    },
    [pushUndo, addConnection],
  )

  // -- Generation and assets --------------------------------------------------

  const collectReferenceImages = useCallback((referenceImageIds: string[]): string[] => {
    const refs = new Set(referenceImageIds)
    const connectedImages = new Set<string>()
    const state = useSmartCanvasStore.getState()

    for (const connection of state.connections) {
      const fromNode = state.nodes.find(node => node.id === connection.from)
      const toNode = state.nodes.find(node => node.id === connection.to)
      if (toNode?.type === 'smart-prompt' && fromNode?.images?.length) {
        for (const image of fromNode.images) connectedImages.add(image.url)
      }
    }

    for (const node of state.nodes) {
      if (refs.has(node.id)) {
        for (const image of node.images) connectedImages.add(image.url)
      }
    }

    return [...connectedImages]
  }, [])

  const handlePromptSubmit = useCallback(
    async (prompt: string, negativePrompt: string, referenceImageIds: string[]) => {
      const api = getElectronAPI()
      if (!api) return

      const world = vmRef.current?.screenToWorld(window.innerWidth / 2, window.innerHeight / 2) ?? {
        x: 120,
        y: 120,
      }
      const generationNode = addNode('smart-image', world.x - 160, world.y - 160, {
        title: prompt.slice(0, 48) || 'Generating...',
        running: true,
        pending: 1,
        images: [],
        runStartedAt: Date.now(),
        runSettings: {
          engine: 'api',
          model: generationSettings.model,
          count: 1,
        },
      })

      try {
        const response = await api.apiGenerate({
          prompt,
          negativePrompt: negativePrompt || undefined,
          model: generationSettings.model,
          width: generationSettings.width,
          height: generationSettings.height,
          batchSize: 1,
          referenceImages: collectReferenceImages(referenceImageIds),
          sourceImage: collectReferenceImages(referenceImageIds)[0],
          resolutionPreset: generationSettings.resolutionPreset,
          sizeTier: generationSettings.sizeTier,
          returnMode: 'base64',
        })

        if (response.error || !response.taskId) {
          updateNode(generationNode.id, {
            running: false,
            pending: 0,
            title: 'Generation failed',
            generationError: response.error || 'Generation task was not created',
          })
          return
        }

        updateNode(generationNode.id, {
          title: 'Generating...',
          generationTaskId: response.taskId,
        })
        setActiveTaskIds(prev => new Set(prev).add(response.taskId))

        if (response.cached && response.result?.images?.length) {
          const images: NodeImage[] = response.result.images.map((image, index) => ({
            url:
              image.format === 'base64' && !image.data.startsWith('data:')
                ? `data:image/png;base64,${image.data}`
                : image.format === 'localPath'
                  ? `file://${image.data}`
                  : image.data,
            name: `cached-${index + 1}.png`,
            kind: 'generated',
            naturalWidth: image.width,
            naturalHeight: image.height,
          }))
          updateNode(generationNode.id, {
            images,
            running: false,
            pending: 0,
            title: 'Generated',
            runFinishedAt: Date.now(),
          })
          images.forEach(image => {
            api
              .assetsImport({
                data: image.url,
                prompt,
                model: generationSettings.model,
                width: image.naturalWidth,
                height: image.naturalHeight,
                tags: ['generated', 'canvas'],
              })
              .catch(err => console.warn('[SmartCanvas] Asset auto-import failed:', err))
          })
        }
      } catch (err) {
        updateNode(generationNode.id, {
          running: false,
          pending: 0,
          title: 'Generation failed',
          generationError: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [addNode, collectReferenceImages, generationSettings, updateNode],
  )

  // -- Image-specific callbacks ----------------------------------------------

  const handleImageDoubleClick = useCallback((_nodeId: string, _imageIndex: number) => {
    // Image editor integration point — handled by a separate editor component
  }, [])

  const handleUploadImages = useCallback((nodeId: string, files: FileList, options?: { skipUndo?: boolean }) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    if (!options?.skipUndo) pushUndo()
    for (const file of imageFiles) {
      const reader = new FileReader()
      reader.onload = () => {
        const url = reader.result as string
        useSmartCanvasStore.getState().addImageToNode(nodeId, {
          url,
          name: file.name,
          kind: 'uploaded',
        })
      }
      reader.readAsDataURL(file)
    }
  }, [pushUndo])

  const handleSmartAssetDropToNode = useCallback((nodeId: string, image: NodeImage) => {
    pushUndo()
    useSmartCanvasStore.getState().addImageToNode(nodeId, image)
  }, [pushUndo])

  const handleAssetDropToNode = useCallback((nodeId: string, assetId: string) => {
    pushUndo()
    const api = getElectronAPI()
    api
      ?.assetsGet(assetId)
      .then(asset => {
        if (!asset?.filePath) return
        useSmartCanvasStore.getState().addImageToNode(nodeId, {
          url: `file://${asset.filePath}`,
          name: asset.fileName,
          kind: 'reference',
          naturalWidth: asset.width,
          naturalHeight: asset.height,
        })
      })
      .catch(err => console.warn('[SmartCanvas] Asset drop to node failed:', err))
  }, [pushUndo])

  const handleAssetDrop = useCallback(
    (e: React.DragEvent) => {
      const assetId = e.dataTransfer.getData('application/asset-id')
      const smartAsset = e.dataTransfer.getData('application/x-smart-asset')
      const imageFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'))
      if (!assetId && !smartAsset && imageFiles.length === 0) return
      e.preventDefault()
      pushUndo()

      const vm = vmRef.current
      const world = vm?.screenToWorld(e.clientX, e.clientY) ?? { x: 0, y: 0 }

      if (smartAsset) {
        try {
          const parsed = JSON.parse(smartAsset) as Partial<NodeImage>
          if (parsed.url) {
            addNode('smart-image', world.x, world.y, {
              title: parsed.name || 'Smart asset',
              images: [
                {
                  url: parsed.url,
                  name: parsed.name || 'smart-asset',
                  kind: parsed.kind === 'generated' || parsed.kind === 'uploaded' ? parsed.kind : 'reference',
                },
              ],
            })
            return
          }
        } catch {
          // Ignore malformed drag payloads.
        }
      }

      if (assetId) {
        const api = getElectronAPI()
        api
          ?.assetsGet(assetId)
          .then(asset => {
            if (!asset?.filePath) return
            addNode('smart-image', world.x, world.y, {
              title: asset.prompt?.slice(0, 32) || asset.fileName,
              images: [
                {
                  url: `file://${asset.filePath}`,
                  name: asset.fileName,
                  kind: 'reference',
                  naturalWidth: asset.width,
                  naturalHeight: asset.height,
                },
              ],
            })
          })
          .catch(err => console.warn('[SmartCanvas] Asset drop failed:', err))
        return
      }

      const node = addNode('smart-image', world.x, world.y, {
        title: imageFiles[0]?.name?.replace(/\.[^.]+$/, '') || 'Uploaded images',
      })
      handleUploadImages(node.id, e.dataTransfer.files, { skipUndo: true })
    },
    [addNode, handleUploadImages, pushUndo],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/asset-id') || e.dataTransfer.types.includes('application/x-smart-asset') || e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  // -- Connection deletion ---------------------------------------------------

  const handleDeleteConnection = useCallback(
    (from: string, to: string) => {
      pushUndo()
      removeConnection(from, to)
    },
    [pushUndo, removeConnection],
  )

  // -- Minimap viewport change -----------------------------------------------

  const handleMinimapViewportChange = useCallback((vp: Partial<Viewport>) => {
    const vm = vmRef.current
    if (!vm) return
    vm.setViewport(vp)
  }, [])

  // -- Wheel forwarding (ViewportManager handles it, but we also close menus)

  const handleWheel = useCallback((_e: React.WheelEvent) => {
    setContextMenu(null)
  }, [])

  const isGenerating = activeTaskIds.size > 0

  // -- Selected set for quick lookup -----------------------------------------

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // -- Render node by type ---------------------------------------------------

  const renderNode = useCallback(
    (node: SmartNode) => {
      const isSelected = selectedSet.has(node.id)

      const commonProps = {
        node,
        selected: isSelected,
        onUpdate: handleNodeUpdate,
        onPortMouseDown: handlePortMouseDown,
        onNodeMouseDown: handleNodeMouseDown,
        onResizeMouseDown: handleResizeMouseDown,
        onDeleteNode: handleDeleteNode,
      }

      switch (node.type) {
        case 'smart-image':
          return (
            <SmartImageNode
              key={node.id}
              {...commonProps}
              onImageDoubleClick={handleImageDoubleClick}
              onUploadImages={handleUploadImages}
              onAssetDrop={handleAssetDropToNode}
              onSmartAssetDrop={handleSmartAssetDropToNode}
            />
          )
        case 'smart-prompt':
          return <SmartPromptNode key={node.id} {...commonProps} />
        case 'smart-loop':
          return <SmartLoopNode key={node.id} {...commonProps} />
        default:
          return null
      }
    },
    [
      selectedSet,
      handleNodeUpdate,
      handlePortMouseDown,
      handleNodeMouseDown,
      handleResizeMouseDown,
      handleDeleteNode,
      handleImageDoubleClick,
      handleUploadImages,
      handleAssetDropToNode,
      handleSmartAssetDropToNode,
    ],
  )

  // -- Zoom percentage for display -------------------------------------------

  const zoomPercent = Math.round(viewport.scale * 100)

  // -- Render ----------------------------------------------------------------

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0f]">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-slate-700/40 bg-slate-900/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            &larr; Back
          </button>
          <button
            onClick={() => setAssetLibraryOpen(v => !v)}
            className="rounded px-2 py-1 text-sm text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            Assets
          </button>
          <span className="text-sm font-medium text-slate-300">{canvasName || 'Smart Canvas'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{zoomPercent}%</span>
          <span>{nodes.length} nodes</span>
        </div>
      </div>

      {/* ── Shell (event capture layer) ─────────────────────────────── */}
      <div
        ref={shellRef}
        className="absolute inset-0 pt-10"
        style={{ cursor: wipConnection ? 'crosshair' : 'default' }}
        onMouseDown={handleShellMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onDrop={handleAssetDrop}
        onDragOver={handleDragOver}
        tabIndex={0}
      >
        {/* ── World (transformed container) ──────────────────────────── */}
        <div
          ref={worldRef}
          className="absolute"
          style={{
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {nodes.map(renderNode)}
        </div>

        {/* ── Connection layer (SVG overlay) ─────────────────────────── */}
        <ConnectionLayer
          connections={connections}
          nodes={nodes}
          wipConnection={wipConnection}
          onDeleteConnection={handleDeleteConnection}
          viewport={viewport}
        />

        {/* ── Selection rubber-band rectangle ────────────────────────── */}
        {selectionBox && selectionBox.width > 0 && selectionBox.height > 0 && (
          <div
            className="pointer-events-none absolute rounded-sm border border-indigo-500/60 bg-indigo-500/10"
            style={{
              left: selectionBox.x * viewport.scale + viewport.x,
              top: selectionBox.y * viewport.scale + viewport.y,
              width: selectionBox.width * viewport.scale,
              height: selectionBox.height * viewport.scale,
              zIndex: 30,
            }}
          />
        )}
      </div>

      {/* ── Minimap ─────────────────────────────────────────────────── */}
      <Minimap
        nodes={nodes}
        viewport={viewport}
        shellRect={shellRect}
        onViewportChange={handleMinimapViewportChange}
      />

      <CanvasPromptBar
        objects={nodes
          .filter(node => node.images.length > 0)
          .map(node => ({
            id: node.id,
            type: 'image' as const,
            x: node.x,
            y: node.y,
            width: node.w,
            height: node.h,
            rotation: 0,
            zIndex: 0,
            opacity: 1,
            locked: false,
            imageUrl: node.images[0]?.url || '',
            prompt: node.text || node.title,
            model: node.runSettings.model,
            status: node.running ? ('generating' as const) : ('idle' as const),
          }))}
        isGenerating={isGenerating}
        onSubmit={handlePromptSubmit}
      />

      {assetLibraryOpen && (
        <div className="absolute bottom-0 right-0 top-10 z-50 w-80 shadow-2xl">
          <AssetLibrary onClose={() => setAssetLibraryOpen(false)} />
        </div>
      )}

      {/* ── Context menu (right-click) ──────────────────────────────── */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={dismissContextMenu}
            onContextMenu={e => {
              e.preventDefault()
              dismissContextMenu()
            }}
          />
          <div
            className="fixed z-[70] min-w-[180px] rounded-lg border border-slate-600/60 bg-slate-800 py-1.5 shadow-2xl backdrop-blur-sm"
            style={{
              left: contextMenu.screenX,
              top: contextMenu.screenY,
            }}
          >
            <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Add Node
            </div>
            {NODE_MENU_ITEMS.map(item => (
              <button
                key={item.type}
                onClick={() => handleCreateNode(item.type)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
              >
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default SmartCanvas
