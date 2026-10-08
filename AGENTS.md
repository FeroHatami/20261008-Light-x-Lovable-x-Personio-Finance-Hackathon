<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Light API calls run only in server functions via src/lib/light.server.ts; the key never reaches the browser.
- Viewer resolution lives in src/lib/db.server.ts resolveViewer(): Lovable identity header first, else the demo account's Cloud session bearer; the DB client acts as that user so RLS applies; never use the admin client.
- The demo account's password stays in a server secret; one-click demo sign-in returns only session tokens. Public signup stays disabled.
- The public customer portal reads/writes only through token-checked SECURITY DEFINER database functions, because visitors have no account.
- Light writes happen only when an Approval Queue item is approved; draft invoices need companyEntityId plus productId lines with priceOverwrite.
