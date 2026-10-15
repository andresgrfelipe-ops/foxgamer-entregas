import { processQueue } from '../../lib/shipment-email.mjs';

export default async () => {
  const result = await processQueue({env:key=>Netlify.env.get(key)});
  return Response.json(result);
};
export const config = {schedule:'* * * * *'};
