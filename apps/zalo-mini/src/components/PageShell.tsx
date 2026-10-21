import type { ReactNode } from 'react';
import { Page } from 'zmp-ui';
import { TopBar } from './ui';

/** Khung trang: header thương hiệu + nội dung cuộn, chừa chỗ cho thanh điều hướng và thanh giỏ phía dưới. */
export function PageShell({
  title,
  back,
  right,
  children,
  bare,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <Page className="min-h-full bg-cream" hideScrollbar>
      <TopBar title={title} back={back} right={right} />
      <div
        className={
          bare
            ? 'pb-[calc(env(safe-area-inset-bottom,0px)+150px)]'
            : 'px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+150px)]'
        }
      >
        {children}
      </div>
    </Page>
  );
}
