import { emailConfiguration } from '../../lib/shipment-email.mjs';

export default async () => Response.json(
  {enabled:emailConfiguration(key=>Netlify.env.get(key)).enabled},
  {headers:{'Cache-Control':'no-store'}}
);
