import { createNewsReader } from './createNewsReader';

const transport = createNewsReader((appId, before) => backend.fetch_news(appId, before));
export const readNewsPage = transport.readPage;
export const invalidateNews = transport.invalidate;
