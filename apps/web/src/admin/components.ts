import path from 'node:path';
import { ComponentLoader } from 'adminjs';

export const componentLoader = new ComponentLoader();

// Same convention as the EJS views: resolved from the app's working directory, in dev and in the image.
const source = (name: string) => path.resolve(process.cwd(), 'src/admin/components', name);

export const components = {
  Dashboard: componentLoader.add('Dashboard', source('Dashboard.jsx')),
  ReasonAction: componentLoader.add('ReasonAction', source('ReasonAction.jsx'))
};
