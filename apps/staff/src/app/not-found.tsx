import { DeadEnd } from '@/components/shell/dead-end';

export const metadata = { title: 'Không tìm thấy trang – DaLan OS' };

export default function NotFound() {
  return <DeadEnd code="Lỗi 404" title="Không tìm thấy trang" message="Đường dẫn có thể đã thay đổi hoặc mục này không còn tồn tại. Hãy quay về sơ đồ bàn để tiếp tục phục vụ." />;
}
