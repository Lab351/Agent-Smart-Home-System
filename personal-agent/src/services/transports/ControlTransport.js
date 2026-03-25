/**
 * 控制传输层抽象接口
 *
 * 子类需要提供统一的控制、能力查询和订阅接口。
 */
export default class ControlTransport {
  async connect() {
    throw new Error('connect() must be implemented by subclass')
  }

  disconnect() {
    throw new Error('disconnect() must be implemented by subclass')
  }

  isConnected() {
    throw new Error('isConnected() must be implemented by subclass')
  }

  async sendControl() {
    throw new Error('sendControl() must be implemented by subclass')
  }

  async queryCapabilities() {
    throw new Error('queryCapabilities() must be implemented by subclass')
  }

  async subscribeToState() {
    throw new Error('subscribeToState() must be implemented by subclass')
  }

  async subscribeToDescription() {
    throw new Error('subscribeToDescription() must be implemented by subclass')
  }
}
