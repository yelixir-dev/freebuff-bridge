# Dashboard Design Contract

The dashboard follows the Emil editorial system used by CommandCode Bridge. This document is the frontend contract; implementation must preserve IDs, translations, API behavior, and the save/restart flow. Same-origin dashboard saves and restarts do not require re-entering the client API key.

## Color tokens

Use the shared CSS custom properties rather than introducing local theme colors.

| Token      | Value     | Role                                                       |
| ---------- | --------- | ---------------------------------------------------------- |
| `--ink`    | `#28231f` | Hero, primary text, and decisive controls                  |
| `--canvas` | `#f1ede5` | Page canvas                                                |
| `--paper`  | `#fffdf8` | Cards, fields, and fold surfaces                           |
| `--rust`   | `#9f4d2e` | Editorial accents, destructive actions, disclosure markers |
| `--teal`   | `#1f6f78` | Selected and positive interactive states                   |
| `--gold`   | `#b57920` | Metadata, focus rings, and restart emphasis                |

Rules use `#d9d0c4`; muted copy uses `#6d665e`. Shadows stay restrained at `0 14px 34px rgba(65,49,35,.10)`. Do not add gradients, generic purple, or decorative pill collections.

## Typography

- Body, headings, and editorial hierarchy use Georgia with Times New Roman and `serif` fallbacks.
- Interface metadata, compact labels, counters, and controls use the system sans stack.
- Machine values and state tokens use the monospace stack.
- Headings use tight tracking and compact line height; labels use small uppercase sans text.

## Spacing and materials

- The warm canvas surrounds a centered page with a maximum width of 1120px.
- The dark hero includes a low-opacity inset hairline frame. Its metadata uses gold and rust accents.
- The title and language flags share one `.brand-row`. Bind host and port share `.bind-grid`. The client key uses the `sk-` prefix chrome and generate/copy/save icons from CommandCode Bridge.
- Concurrent-cap input is `[hidden]` unless the policy is `short_thick`. Author `display` rules must not override `[hidden]`.
- The credentials heading has a click-to-toggle `[i]` (`#credHelp`) that explains how to add `authToken`s. Hover does not pin it; Escape and outside click close it.
- Cards use the paper surface, a dark top rule, and one restrained shadow. Avoid nested ornamental containers.
- Use the 4/8/12/16/24/32px rhythm. Dense controls may use the smaller steps; primary sections use 16px or more.
- Controls are square-edged editorial elements, not pills. Borders and spacing establish hierarchy before color.

## Provider folds

- Models are grouped by their provider and provider groups are sorted alphabetically.
- Every provider is a native `<details class="provider-fold">` with a native `<summary>` and no `open` attribute.
- Summary text is `Provider (enabled/total)` and exposes `data-provider`, `data-enabled`, and `data-total`.
- A model toggle updates configuration and the fold's enabled count in place. It must not rebuild the model container.

## Credential folds

- Every credential is a native `<details class="credential-fold">` with no `open` attribute.
- The summary keeps the credential name and current session-quota status visible.
- Opening or closing a credential must not alter its configuration or the save/restart flow.

## Accessibility

- Preserve semantic landmarks, sections, headings, labels, native details/summary behavior, and button/input elements.
- Every keyboard-operable element has a high-contrast gold `:focus-visible` outline with offset.
- Toggle checkboxes remain in the accessibility and keyboard trees.
- Color is never the only state indicator.
- Respect `prefers-reduced-motion: reduce`.
- Localized prose and ARIA labels remain translation-driven (ko / en / zh).

## Responsive behavior

- Below 760px, sections form one column and provider model rows form one column.
- At 760px and above, the server and routing editors share two columns; credentials and models span the page.
- Below 560px, hero and card spacing contracts and bind controls become one column.
- Below 520px, save and restart actions share two columns while status text occupies the full row.

## Change discipline

Visual renewal must not rename existing DOM IDs, alter API endpoints or payloads, replace translated strings, or change credential, routing, save, restart, and polling behavior.
