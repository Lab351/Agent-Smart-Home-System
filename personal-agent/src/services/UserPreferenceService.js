/**
 * 用户偏好服务
 * 管理用户习惯和个性化设置
 */

export default class UserPreferenceService {
  constructor() {
    this.storage = null
    this.STORAGE_KEY = 'user_preferences'
    this.cachedData = null

    this.initStorage()
  }

  /**
   * 初始化存储模块
   */
  initStorage() {
    try {
      this.storage = require('@system.storage')
      console.log('[UserPreferenceService] Storage initialized')
    } catch (err) {
      console.error('[UserPreferenceService] Failed to init storage:', err)
    }
  }

  /**
   * 生成 UUID
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * 加载偏好数据
   */
  async loadPreferences() {
    return new Promise((resolve, reject) => {
      if (this.cachedData) {
        resolve(this.cachedData)
        return
      }

      if (!this.storage) {
        reject(new Error('Storage not initialized'))
        return
      }

      this.storage.get({
        key: this.STORAGE_KEY,
        success: (data) => {
          try {
            this.cachedData = data || this.getDefaultPreferences()
            console.log('[UserPreferenceService] Preferences loaded:', this.cachedData)
            resolve(this.cachedData)
          } catch (err) {
            console.error('[UserPreferenceService] Failed to parse preferences:', err)
            resolve(this.getDefaultPreferences())
          }
        },
        fail: () => {
          console.log('[UserPreferenceService] No preferences found, using defaults')
          this.cachedData = this.getDefaultPreferences()
          resolve(this.cachedData)
        }
      })
    })
  }

  /**
   * 保存偏好数据
   */
  async savePreferences(preferences) {
    return new Promise((resolve, reject) => {
      if (!this.storage) {
        reject(new Error('Storage not initialized'))
        return
      }

      this.storage.set({
        key: this.STORAGE_KEY,
        value: preferences,
        success: () => {
          this.cachedData = preferences
          console.log('[UserPreferenceService] Preferences saved')
          resolve(true)
        },
        fail: (data, code) => {
          console.error('[UserPreferenceService] Failed to save preferences:', code, data)
          reject(new Error(`Failed to save: ${code}`))
        }
      })
    })
  }

  /**
   * 获取默认偏好
   */
  getDefaultPreferences() {
    return {
      habits: [],
      preferences: {
        defaultRoom: 'livingroom',
        lighting: {
          bedtime: '22:00',
          preferredBrightness: 80
        },
        climate: {
          preferredTemp: 26,
          mode: 'cool'
        }
      },
      lastUpdated: Date.now()
    }
  }

  /**
   * 添加用户习惯
   */
  async addHabit(content, category = 'general', frequency = 1) {
    const preferences = await this.loadPreferences()

    const newHabit = {
      id: this.generateUUID(),
      content: content,
      category: category,
      timestamp: Date.now(),
      frequency: frequency,
      active: true
    }

    preferences.habits.unshift(newHabit)
    preferences.lastUpdated = Date.now()

    await this.savePreferences(preferences)
    return newHabit
  }

  /**
   * 删除用户习惯
   */
  async deleteHabit(habitId) {
    const preferences = await this.loadPreferences()

    preferences.habits = preferences.habits.filter(h => h.id !== habitId)
    preferences.lastUpdated = Date.now()

    await this.savePreferences(preferences)
    return true
  }

  /**
   * 更新用户习惯
   */
  async updateHabit(habitId, updates) {
    const preferences = await this.loadPreferences()

    const habitIndex = preferences.habits.findIndex(h => h.id === habitId)
    if (habitIndex === -1) {
      throw new Error('Habit not found')
    }

    preferences.habits[habitIndex] = {
      ...preferences.habits[habitIndex],
      ...updates
    }
    preferences.lastUpdated = Date.now()

    await this.savePreferences(preferences)
    return preferences.habits[habitIndex]
  }

  /**
   * 获取所有习惯
   */
  async getAllHabits() {
    const preferences = await this.loadPreferences()
    return preferences.habits
  }

  /**
   * 根据分类获取习惯
   */
  async getHabitsByCategory(category) {
    const habits = await this.getAllHabits()
    return habits.filter(h => h.category === category)
  }

  /**
   * 获取偏好设置
   */
  async getPreference(path) {
    const preferences = await this.loadPreferences()
    const keys = path.split('.')

    let value = preferences.preferences
    for (const key of keys) {
      value = value?.[key]
    }

    return value
  }

  /**
   * 设置偏好
   */
  async setPreference(path, value) {
    const preferences = await this.loadPreferences()
    const keys = path.split('.')

    let target = preferences.preferences
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!target[key]) {
        target[key] = {}
      }
      target = target[key]
    }

    target[keys[keys.length - 1]] = value
    preferences.lastUpdated = Date.now()

    await this.savePreferences(preferences)
    return true
  }

  /**
   * 智能提取习惯（从对话中）
   */
  async extractHabitFromConversation(message, category = 'general') {
    const keywords = {
      lighting: ['关灯', '开灯', '亮度', '颜色', '喜欢', '习惯', '每天'],
      climate: ['温度', '空调', '制热', '制冷', '喜欢', '习惯'],
      entertainment: ['播放', '音乐', '声音', '音量', '喜欢', '习惯'],
      general: ['喜欢', '习惯', '每天', '经常', '总是']
    }

    const categoryKeywords = keywords[category] || keywords.general
    const containsKeyword = categoryKeywords.some(kw => message.includes(kw))

    if (containsKeyword) {
      return await this.addHabit(message, category)
    }

    return null
  }

  /**
   * 清空所有数据
   */
  async clearAll() {
    const defaults = this.getDefaultPreferences()
    await this.savePreferences(defaults)
    return true
  }

  /**
   * 导出数据为 JSON 字符串
   */
  async exportData() {
    const preferences = await this.loadPreferences()
    return JSON.stringify(preferences, null, 2)
  }

  /**
   * 导入数据
   */
  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      await this.savePreferences(data)
      return true
    } catch (err) {
      console.error('[UserPreferenceService] Failed to import data:', err)
      throw new Error('Invalid data format')
    }
  }
}
