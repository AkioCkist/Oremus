import path from 'node:path';
import { ComponentLoader } from 'adminjs';

export const componentLoader = new ComponentLoader();

// Same convention as the EJS views: resolved from the app's working directory, in dev and in the image.
const source = (name: string) => path.resolve(process.cwd(), 'src/admin/components', name);

export const components = {
  Dashboard: componentLoader.add('Dashboard', source('Dashboard.jsx')),
  // Monitoring pages (src/monitoring), one per section.
  Monitoring: componentLoader.add('Monitoring', source('Monitoring.jsx')),
  MonitorServers: componentLoader.add('MonitorServers', source('MonitorServers.jsx')),
  MonitorRequests: componentLoader.add('MonitorRequests', source('MonitorRequests.jsx')),
  MonitorExceptions: componentLoader.add('MonitorExceptions', source('MonitorExceptions.jsx')),
  MonitorDatabase: componentLoader.add('MonitorDatabase', source('MonitorDatabase.jsx')),
  MonitorCache: componentLoader.add('MonitorCache', source('MonitorCache.jsx')),
  MonitorQueues: componentLoader.add('MonitorQueues', source('MonitorQueues.jsx')),
  MonitorOutgoing: componentLoader.add('MonitorOutgoing', source('MonitorOutgoing.jsx')),
  MonitorUsage: componentLoader.add('MonitorUsage', source('MonitorUsage.jsx')),
  ReasonAction: componentLoader.add('ReasonAction', source('ReasonAction.jsx')),
  // Record pages: a visual summary per resource (see RecordShow.jsx), every field underneath.
  RecordShow: componentLoader.add('RecordShow', source('RecordShow.jsx')),
  // List cells.
  CellPill: componentLoader.add('CellPill', source('CellPill.jsx')),
  CellPerson: componentLoader.add('CellPerson', source('CellPerson.jsx')),
  CellDate: componentLoader.add('CellDate', source('CellDate.jsx')),
  CellText: componentLoader.add('CellText', source('CellText.jsx')),
  CellThumb: componentLoader.add('CellThumb', source('CellThumb.jsx')),
  CellPercent: componentLoader.add('CellPercent', source('CellPercent.jsx')),
  Money: componentLoader.add('Money', source('Money.jsx'))
};

// Replaces AdminJS's own pieces: every resource list gets view tabs, search and filter chips; the sidebar's page list
// becomes the System group; the signed-in menu works with the keyboard.
componentLoader.override('DefaultListAction', source('ResourceList.jsx'));
componentLoader.override('SidebarPages', source('SidebarPages.jsx'));
componentLoader.override('LoggedIn', source('LoggedIn.jsx'));
