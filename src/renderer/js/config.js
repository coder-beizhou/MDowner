// 配置加载/保存
export async function loadConfig(app) {
  try {
    if (window.electronAPI) {
      const config = await window.electronAPI.loadConfig();
      app.config = { ...app.config, ...config };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

export async function saveConfig(app) {
  try {
    if (window.electronAPI) {
      await window.electronAPI.saveConfig(app.config);
    }
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}
