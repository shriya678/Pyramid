'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TopBar } from '@/components/workspace/top-bar';

/**
 * Placeholder for the Projects list. Sidebar links here; real table view
 * ships with the Projects CRUD frontend PR.
 */
export default function ProjectsPage() {
  return (
    <>
      <TopBar title="Projects" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projects list — coming later</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                The Projects table + create + detail view render here in a follow-up frontend PR.
                Backend CRUD is already live — try{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  GET /workspaces/&lt;slug&gt;/projects
                </code>{' '}
                in the Postman collection.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
