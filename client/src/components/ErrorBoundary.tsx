import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary 捕获到错误:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback
      }

      // 默认错误界面
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white/[0.06] p-8 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-8 w-8 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-slate-100">出错了</h2>
              <p className="text-slate-600">应用遇到了一个错误，请刷新页面重试</p>
            </div>

            <details className="mb-6 rounded-lg bg-white/[0.04] p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-300">
                错误详情
              </summary>
              <div className="mt-3 max-h-40 overflow-auto font-mono text-xs text-slate-600">
                <p className="mb-2 text-red-600">{this.state.error?.toString()}</p>
                {this.state.errorInfo && (
                  <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                )}
              </div>
            </details>

            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-primary-500 py-3 font-medium text-white transition-colors hover:bg-primary-600"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
