import { createContext, useContext, useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { VoluntaryExitProvider } from '@/shared/navigation/voluntary-exit';
const Content = createContext<ReactNode>(null);
function Root() { return <VoluntaryExitProvider>{useContext(Content)}</VoluntaryExitProvider>; }
/** Real data router with refreshable descendants for feature tests. */
export function MemoryRouter({ children, initialEntries = ['/'] }: { readonly children: ReactNode; readonly initialEntries?: string[] }) {
  const [router] = useState(() => createMemoryRouter([{ path: '*', element: <Root/> }], { initialEntries }));
  return <Content.Provider value={children}><RouterProvider router={router}/></Content.Provider>;
}
