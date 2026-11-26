<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Classroom architecture
- Snapshot lesson selection per classroom; isolate Bài 11 with its own 90-second Track on room-local goal progress, so Bài 12 remains unchanged.
- AI keys live in classroom memory; only the teacher's explicit save keeps one in browser localStorage, never the database.
- Pass adjacent-part callbacks and backward final-step entry through PresentationNavigation to the review hook; student clocks and releases remain separate.
- The lesson AI solver relays teacher-supplied Gemini keys through an authenticated server function without storage or logging; keep the explicitly requested model and return sanitized errors.
- Activity 2 derives cumulative concept reveals from a pure ordered walkthrough; teacher previews use the shared Enter/Backspace hook, keeping keyboard presentation separate from student submission and clocks.
- Activity 1 teacher results use Activity 2's lesson-layout sidebar with one selected question, rendering the shared lazily loaded GoalModelViewer from ActivityOne so the review model and its highlight match what students saw.
- Keep mathematical definitions in pure TypeScript and let the R3F scene only draw them, so camera motion cannot alter geometric relationships.
- Enlarge individual geometry presentations through camera field of view, not world geometry, so mathematical visibility and motion invariants stay unchanged.
- Animate line transforms from a shared world-space phase in useFrame, with geometry invariants checked each frame; speed only advances phase and pause never disables orbit controls.
- Presentation steps keep later lines mounted via reveal() (data-reveal): teacher presentation hides them with opacity/visibility so Enter never shifts the slide, other modes drop them from layout; full screen state comes from fullscreenchange events and never from scrolling code.
- Teacher data uses signed-in owner RLS; students use server-validated per-team capabilities, so they need no accounts and cannot read unreleased answers.
- Only the root subscribes to auth identity changes; components refresh verified user state from its notification to prevent competing subscriptions.
- Team capability hashes never leave the server; plaintext links are returned only once to the verified room creator to reduce secret exposure.
- Code-only entry validates an open classroom and selected team server-side, then derives a stable capability from the stored secret hash; this preserves private reads and server clocks without manual team secrets.
- Question clocks are server-authoritative: start/end timestamps live in team timings, start is set once and end is capped at the deadline, so reloads or disconnects never grant extra time.
- Each lesson part has its own stored number (1–2 = Hoạt động 1–2, 3 = box practice on the legacy practice1_* columns, 4 = photo practice, 5 = Hoạt động 3), release timestamp and SHOW ANSWER flag; display names and order live only in assignment.ts so renaming or reordering parts never needs a schema change; ordinary switching never releases a part, while the explicit double-Enter review completion switches and releases Activity 2.
- Hoạt động 2, Luyện tập 1 (photo) and Hoạt động 3 are presentation parts (isPresentationPart in assignment.ts): never released or answered, the teacher steps a pure ordered stage list (activity3-walkthrough.ts) with the shared Enter hook, so stages change without schema changes.
- Hoạt động 3 reuses the exported practice recap panel in its text column and renders its figure separately, so all presentation stages share the same text/drawing layout without duplicate math rendering.
- Keep cumulative presentation content derived from the pure stage kind and question identity, so backward navigation restores exactly the same conclusions and answers without extra component state.
- Untimed answered parts (photo practice) use pure submitUntimed with step-conditional updates, so each answer is sent once in order and the last send locks the team's work.
- Activity 1 and the box practice share one timed-step flow (pure reconcileSteps/submitStep with a per-activity StepConfig, server Track adapters per column set); deadlines are reconciled on capability-validated server reads/writes with revision-checked updates, so elapsed questions advance after disconnects and submitted work is immutable.
- Wide screens frame the goal with the pure fitWideGoalView solver (fixed azimuth, elevation solved so eye height sits at a set share of goal height, whole goal centred within a margin); portrait phones use the same solver with a larger fill, so they also look slightly up. Both refit on resize and saveState so reset matches the device, without scaling the mathematical model.
- Teacher updates subscribe to published classroom tables and poll as a fallback, so a dropped realtime connection never requires a manual reload.
- Solid/dashed line parts are computed per frame from the live camera by pure visibility math; points on the plane are never hidden.
- Keep Activity 1's fixed football-goal dimensions and steel-member coordinates in a pure geometry module, separate from its R3F scene, so camera movement cannot alter the model.

- Online-exam students are not Supabase Auth users: teacher-issued usernames with PBKDF2 hashes in exam_students (plus an AES-GCM copy, keyed by HKDF from the server's service-role secret, so the teacher can read class default and student-changed passwords), random session tokens stored only as SHA-256 in exam_student_sessions, all reads/writes through src/lib/exam server functions with the service role after checking class ownership, so student accounts never reach teacher-only routes or RLS.

## Database migrations
- Schema changes are new ALTER migrations after the 0000_create_classroom_schema baseline, never edits to it, so history replays cleanly.
- Lesson formulas are TeX between `$...$` in the pure lesson data, typeset only by MathText (KaTeX, `\ss` macro = "//"), so every symbol uses one math font and textbook spacing.
- Full screen presentation enlarges lesson text only through html.presenting CSS (toggled from fullscreenchange) and turns off shrink-to-fit there, so fitting never cancels the enlargement; teacher keys F1/F2/F12 map through pure presentationShortcut to the existing button actions.
- Presentation cover pictures follow pure transitions in presentation-covers.ts and pause the shared Enter hook through PresentationNavigation.readOnly, so covers never alter part steps or student sync.

<!-- AGENT-MEMORY:BEGIN -->
<!-- AGENT-MEMORY:END -->
