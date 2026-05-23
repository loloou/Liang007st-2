import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getInpaintCapability, inpaintImage } from '../inpaintClient'
import type { ApiConfig } from '../settings'

const STORAGE_KEY = 'liang007_api_settings_v2'

function makeConfig(patch: Partial<ApiConfig> = {}): ApiConfig {
  return {
    globalBaseUrl: 'https://example.test/api/v1',
    globalApiKey: 'test-key',
    globalApiSpec: 'openai',
    chatModels: [],
    imageModels: [
      {
        id: 'img-1',
        modelId: 'edit-model',
        supportsInpaint: true,
      },
    ],
    activeImageModelId: 'img-1',
    apiValidateJson: true,
    apiVendors: [],
    activeVendorId: '',
    balanceConfigs: [],
    activeBalanceConfigId: '',
    ...patch,
  }
}

function saveConfig(config: ApiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function mockDataUrlBlobFetch(apiResponse: Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('data:')) {
      return new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 })
    }
    return apiResponse
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const baseParams = {
  imageUrl: 'data:image/png;base64,aW1hZ2U=',
  imageDataUrl: 'data:image/png;base64,aW1hZ2U=',
  maskDataUrl: 'data:image/png;base64,bWFzaw==',
  prompt: 'replace window with flowers',
  model: 'edit-model',
  width: 1400,
  height: 900,
  n: 2,
}

describe('inpaintImage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('builds the default OpenAI edits endpoint and multipart request', async () => {
    saveConfig(makeConfig())
    const fetchMock = mockDataUrlBlobFetch(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/out.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await inpaintImage(baseParams)

    expect(result.error).toBeUndefined()
    expect(result.endpoint).toBe('https://example.test/api/v1/images/edits')
    expect(result.images).toEqual([{ id: '0', url: 'https://cdn.test/out.png' }])
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [, requestInit] = fetchMock.mock.calls[2]
    expect(fetchMock.mock.calls[2][0]).toBe('https://example.test/api/v1/images/edits')
    expect(requestInit?.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer test-key',
    })
    const form = requestInit?.body as FormData
    expect(form.get('model')).toBe('edit-model')
    expect(form.get('prompt')).toBe('replace window with flowers')
    expect(form.get('size')).toBe('1536x1024')
    expect(form.get('n')).toBe('2')
    expect(form.get('image')).toBeInstanceOf(Blob)
    expect(form.get('mask')).toBeInstanceOf(Blob)
  })

  it('uses a custom model-level inpaint endpoint when configured', async () => {
    saveConfig(
      makeConfig({
        imageModels: [
          {
            id: 'img-1',
            modelId: 'edit-model',
            supportsInpaint: true,
            inpaintEndpoint: 'https://custom.test/v1/images/edits/',
          },
        ],
      }),
    )
    const fetchMock = mockDataUrlBlobFetch(
      new Response(JSON.stringify({ images: ['https://cdn.test/custom.png'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await inpaintImage(baseParams)

    expect(result.endpoint).toBe('https://custom.test/v1/images/edits')
    expect(result.images).toEqual([{ id: '0', url: 'https://cdn.test/custom.png' }])
    expect(fetchMock.mock.calls[2][0]).toBe('https://custom.test/v1/images/edits')
  })

  it('rejects models that have not enabled inpaint support before fetching images', async () => {
    saveConfig(
      makeConfig({
        imageModels: [{ id: 'img-1', modelId: 'some-random-model', supportsInpaint: false }],
      }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await inpaintImage({ ...baseParams, model: 'some-random-model' })

    expect(result.images).toEqual([])
    expect(result.error).toContain('当前模型未启用局部重绘')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports Gemini models without an edits endpoint as unavailable', async () => {
    saveConfig(
      makeConfig({
        globalApiSpec: 'gemini',
        imageModels: [{ id: 'img-1', modelId: 'gemini-image', supportsInpaint: true }],
      }),
    )

    const capability = getInpaintCapability('gemini-image')

    expect(capability.ok).toBe(false)
    expect(capability.spec).toBe('gemini')
    expect(capability.message).toContain('不能直接做严格蒙版局部重绘')
  })

  it('auto-selects a configured inpaint model when the active Gemini model is unavailable', async () => {
    saveConfig(
      makeConfig({
        globalApiSpec: 'gemini',
        imageModels: [
          { id: 'gemini-1', modelId: 'gemini-image', supportsInpaint: false },
          {
            id: 'edit-1',
            modelId: 'gpt-image-2',
            apiSpec: 'openai',
            supportsInpaint: true,
            baseUrl: 'https://openai-compatible.test',
          },
        ],
        activeImageModelId: 'gemini-1',
      }),
    )
    const fetchMock = mockDataUrlBlobFetch(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/edited.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const capability = getInpaintCapability('gemini-image')
    const result = await inpaintImage({ ...baseParams, model: 'gemini-image' })

    expect(capability.ok).toBe(true)
    expect(capability.autoSelected).toBe(true)
    expect(capability.modelId).toBe('gpt-image-2')
    expect(capability.requestedModelId).toBe('gemini-image')
    expect(result.endpoint).toBe('https://openai-compatible.test/v1/images/edits')
    expect(result.error).toBeUndefined()
    const form = fetchMock.mock.calls[2][1]?.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
  })

  it('prefers the requested model over the active model when both are configured', () => {
    saveConfig(
      makeConfig({
        imageModels: [
          { id: 'active', modelId: 'gpt-image-active', supportsInpaint: true },
          { id: 'requested', modelId: 'gpt-image-requested', supportsInpaint: true },
        ],
        activeImageModelId: 'active',
      }),
    )

    const capability = getInpaintCapability('gpt-image-requested')

    expect(capability.ok).toBe(true)
    expect(capability.modelId).toBe('gpt-image-requested')
    expect(capability.autoSelected).toBe(false)
  })

  it('auto-detects gpt-image models by name even without supportsInpaint checked', async () => {
    saveConfig(
      makeConfig({
        globalApiSpec: 'gemini',
        imageModels: [
          { id: 'gemini-1', modelId: 'gemini-image' },
          {
            id: 'edit-1',
            modelId: 'gpt-image-1',
            apiSpec: 'openai',
            baseUrl: 'https://openai-compatible.test',
          },
        ],
        activeImageModelId: 'gemini-1',
      }),
    )
    const fetchMock = mockDataUrlBlobFetch(
      new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/auto.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const capability = getInpaintCapability('gemini-image')
    const result = await inpaintImage({ ...baseParams, model: 'gemini-image' })

    expect(capability.ok).toBe(true)
    expect(capability.autoSelected).toBe(true)
    expect(capability.modelId).toBe('gpt-image-1')
    expect(result.endpoint).toBe('https://openai-compatible.test/v1/images/edits')
    expect(result.error).toBeUndefined()
    const form = fetchMock.mock.calls[2][1]?.body as FormData
    expect(form.get('model')).toBe('gpt-image-1')
  })

  it('returns readable API error details from JSON error responses', async () => {
    saveConfig(makeConfig())
    mockDataUrlBlobFetch(
      new Response(JSON.stringify({ error: { message: 'mask size mismatch' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await inpaintImage(baseParams)

    expect(result.httpStatus).toBe(400)
    expect(result.error).toContain('HTTP 400')
    expect(result.error).toContain('mask size mismatch')
    expect(result.httpErrorBody).toContain('mask size mismatch')
  })

  it('turns unsupported image input errors into actionable Chinese guidance', async () => {
    saveConfig(makeConfig())
    mockDataUrlBlobFetch(
      new Response(
        JSON.stringify({
          error: {
            message:
              'Cannot read "image.png" (this model does not support image input). Inform the user.',
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const result = await inpaintImage(baseParams)

    expect(result.httpStatus).toBe(400)
    expect(result.error).toContain('当前局部重绘模型不支持图片输入')
    expect(result.error).toContain('Inpaint Endpoint')
  })

  it('detects HTML responses as endpoint configuration errors', async () => {
    saveConfig(makeConfig())
    mockDataUrlBlobFetch(
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    const result = await inpaintImage(baseParams)

    expect(result.images).toEqual([])
    expect(result.httpStatus).toBe(200)
    expect(result.error).toContain('API 返回 HTML 而不是 JSON')
  })
})
