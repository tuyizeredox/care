'use client';

import { useEffect } from 'react';

// The App Router has no top-level error boundary unless this file exists. Without
// it, an error thrown while prerendering falls through to Next's internal
// pages-router `_error` shell, which renders <Html> outside of `_document` and
// reports "<Html> should not be imported outside of pages/_document" *instead of*
// the error that actually caused the build to fail.
//
// This boundary replaces the root layout, so it renders <html>/<body> itself and
// deliberately depends on nothing else - no providers, no design-system imports,
// no globals.css. A boundary that can throw is not a boundary.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the detail in the browser console only - never to the user.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          background: '#F8F7F5',
          color: '#13161B',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: '24rem', fontSize: '0.875rem', opacity: 0.7, margin: 0 }}>
          We could not load this page. Try again, and if the problem continues contact your
          administrator.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '1rem',
            borderRadius: '0.375rem',
            border: 'none',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
            background: '#13161B',
            color: '#F8F7F5',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
