import 'zmp-ui/zaui.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import appConfig from '../app-config.json';
import { App } from './App';

// zmp-ui đọc window.APP_CONFIG (Zalo tự gán khi chạy thật; gán sẵn để chạy trên trình duyệt).
const w = window as unknown as { APP_CONFIG?: unknown };
if (!w.APP_CONFIG) w.APP_CONFIG = appConfig;

const root = document.getElementById('app');
if (root) createRoot(root).render(<App />);
