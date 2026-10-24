type IconName = 'search' | 'refresh' | 'clock' | 'chevron' | 'back' | 'check' | 'alert';
const paths: Record<IconName, string> = {
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0a8 8 0 0 1 16 0',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M18 17a7 7 0 0 1-12 2l-2-3',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0a10 10 0 0 1 20 0',
  chevron: 'm9 5 7 7-7 7',
  back: 'm14 5-7 7 7 7 M7 12h14',
  check: 'm5 12 4 4 10-10',
  alert: 'M12 8v5 M12 17h.01 M10 3 1 20h22L14 3Z',
};
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d={paths[name]} />
  </svg>;
}
