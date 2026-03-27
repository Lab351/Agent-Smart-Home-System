import $fetch from '@system.fetch'

function parseJsonBody(response) {
  if (!response) {
    return null
  }

  if (typeof response.data === 'string') {
    return JSON.parse(response.data)
  }

  if (response.data && typeof response.data.data === 'string') {
    return JSON.parse(response.data.data)
  }

  if (response.data && response.data.data && typeof response.data.data === 'object') {
    return response.data.data
  }

  if (response.data && typeof response.data === 'object') {
    return response.data
  }

  return response
}

export default function quickappJsonRequest(options) {
  const requestOptions = {
    url: options.url,
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }

  if (options.data !== undefined) {
    requestOptions.data = options.data
  }

  return new Promise((resolve, reject) => {
    $fetch.fetch(requestOptions)
      .then(response => {
        resolve(parseJsonBody(response))
      })
      .catch(error => {
        reject(error)
      })
  })
}
