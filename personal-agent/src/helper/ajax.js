/**
 * 封装了一些网络请求方法，方便通过 Promise 的形式请求接口
 */
import $fetch from '@system.fetch'
import $utils from './utils'

const TIMEOUT = 20000

Promise.prototype.finally = function(callback) {
  const P = this.constructor
  return this.then(
    value => P.resolve(callback()).then(() => value),
    reason =>
      P.resolve(callback()).then(() => {
        throw reason
      })
  )
}

/**
 * 调用快应用 fetch 接口做网络请求
 * @param params
 */
function fetchPromise(params) {
  return new Promise((resolve, reject) => {
    const fetchOptions = {
      url: params.url,
      method: params.method,
      data: params.data
    }

    // 添加 headers 支持
    if (params.headers) {
      fetchOptions.headers = params.headers
    }

    console.log("fetchOptions", fetchOptions)

    $fetch
      .fetch(fetchOptions)
      .then(response => {
        const result = response.data
        const content = JSON.parse(result.data)
        resolve(content)
      })
      .catch((error, code) => {
        console.log(`🐛 request fail, code = ${code}`)
        reject(error)
      })
      .finally(() => {
        console.log(`✔️ request @${params.url} has been completed.`)
        resolve()
      })
  })
}

/**
 * 处理网络请求，timeout 是网络请求超时之后返回，默认 20s 可自行修改
 * @param params
 */
function requestHandle(params, timeout = TIMEOUT) {
  try {
    return Promise.race([
      fetchPromise(params),
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('网络状况不太好，再刷新一次？'))
        }, timeout)
      })
    ])
  } catch (error) {
    console.log(error)
  }
}

export default {
  post: function(url, params, headers = {}) {
    return requestHandle({
      method: 'post',
      url: url,
      data: params,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })
  },
  get: function(url, params) {
    return requestHandle({
      method: 'get',
      url: $utils.queryString(url, params)
    })
  },
  put: function(url, params, headers = {}) {
    return requestHandle({
      method: 'put',
      url: url,
      data: params,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })
  }
  // 如果，method 您需要更多类型，可自行添加更多方法；
}
