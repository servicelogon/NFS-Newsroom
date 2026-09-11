# Microsoft 365 Message Center integration

## Current state

Beacon has a Microsoft public-news category and a separate **Not connected** Message Center section. The section links to the Microsoft 365 admin portal. It does not read your tenant, request credentials, or represent public Microsoft blog posts as tenant messages.

## Supported integration path

Microsoft documents Message Center messages through Microsoft Graph:

- Endpoint: `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages`
- Permission: `ServiceMessage.Read.All` (work/school delegated or application permission).
- Personal Microsoft accounts are not supported for this endpoint.
- Documentation: https://learn.microsoft.com/en-us/graph/api/serviceannouncement-list-messages?view=graph-rest-1.0

The documentation was fetched and checked during implementation. Its sample includes `@odata.nextLink`; an actual connector must follow pagination safely and handle Graph throttling.

## Before implementing tenant access

1. Decide whether this is a single-tenant private dashboard or a multi-tenant app. Beacon currently has **no user authentication** and must not publish tenant messages in `/api/news`.
2. Register an Entra application in the tenant and obtain appropriate administrator consent. Use the least-privileged documented permission; service health has a separate permission and must not be added implicitly.
3. Add application authentication and tenant authorization before exposing a messages route. Use a supported Microsoft identity library and server-side token handling. Never embed tokens or client secrets in HTML, browser storage, logs, or the public RSS cache.
4. Keep Message Center messages, access tokens, and tenant identifiers separate from public RSS data. Enforce retention and access controls, and sanitize any message HTML before display.
5. Implement bounded requests, pagination, throttling/retry handling, tenant-specific cache expiry, and clear disconnected, permission-denied, expired-auth, and error states.
6. Verify against the authorized tenant; fixture tests alone cannot establish that real tenant access works.

Do not paste secrets into the chat. No credential configuration or tenant authorization has been performed.
