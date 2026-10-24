import {
  definePlugin,
  DialogButton,
  Field,
  IconsModule,
  Navigation,
  routerHook,
} from 'millennium';
import { NewsroomPage } from './NewsroomPage';
import { startNewsroomSession } from './news/useNewsroomSession';
import { requestNewsroomHome } from './navigation';
import { onTopControl, type TopControl } from './navigation';
import { useEffect, useState } from 'react';

const NEWSROOM_ROUTE = '/steam-newsroom';
const LAUNCHER_ID = 'steam-newsroom-launcher';
const openNewsroom = () => { requestNewsroomHome(); Navigation.Navigate(NEWSROOM_ROUTE); };
const dockButtonStyle = {
  padding: '9px 15px', width: 'auto', minWidth: 0, minHeight: 0, boxSizing: 'border-box' as const,
  borderRadius: '6px', border: '1px solid #435c71', background: '#243747', color: '#e2edf6',
  fontSize: '13px', lineHeight: 1.4, boxShadow: '0 4px 16px #0005',
};

const Launcher = () => {
  const [top, setTop] = useState<TopControl>();
  useEffect(() => onTopControl(setTop), []);
  return (
  <div style={{ position: 'fixed', right: '40px', bottom: '64px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '12px' }}>
    {top && <DialogButton aria-label="Scroll to top of Newsroom" title="Back to top" onClick={top.run}
      style={dockButtonStyle}>↑</DialogButton>}
    <DialogButton
      onClick={openNewsroom}
      aria-label="Open Steam Newsroom"
      style={dockButtonStyle}
    >
      Steam Newsroom
    </DialogButton>
  </div>
  );
};

const PluginContent = () => (
  <Field label="Steam Newsroom">
    <DialogButton onClick={openNewsroom} style={{ padding: '8px 16px' }}>
      Open Steam Newsroom
    </DialogButton>
  </Field>
);

export default definePlugin(() => {
  const stopSession = startNewsroomSession();
  let pageIsOpen = false;
  const onVisibilityChange = (visible: boolean) => {
    pageIsOpen = visible;
  };
  const Page = () => <NewsroomPage onVisibilityChange={onVisibilityChange} />;

  routerHook.addRoute(NEWSROOM_ROUTE, Page, { exact: true });
  routerHook.addGlobalComponent(LAUNCHER_ID, Launcher);

  return {
    title: 'Steam Newsroom',
    icon: <IconsModule.Settings />,
    content: <PluginContent />,
    onDismount() {
      stopSession();
      if (pageIsOpen) Navigation.Navigate('/library/home');
      routerHook.removeGlobalComponent(LAUNCHER_ID);
      routerHook.removeRoute(NEWSROOM_ROUTE);
    },
  };
});
