# Design: iOS 27 kit, content first

The only visual source is the iOS and iPadOS 27 UI kit (Figma `a9CMqEJbVkUf1WZckVHkTE`). Its license does not allow embedding SF Pro, SF Symbols or kit assets in a website, so only values and patterns are reused: colors, type scale, radii, material specs, component shapes. Icons stay in `partials/icons.ejs`; the font is the system stack with Inter as fallback.

## Interaction rules

| Rule | Source | What it means here |
|---|---|---|
| Stay in context | Apple HIG: Modality, "view media" and "narrowly scoped task" | Posts, search, notifications, chats, people and create all open over the page. A full page is only for places you settle in. |
| Liquid Glass is for controls | Apple HIG: Materials | Glass on navigation, segmented controls and buttons over photos. Never on content. |
| Motion is purposeful and optional | Apple HIG: Motion | Feedback only, no ambient animation. `prefers-reduced-motion` removes all of it, and nothing relies on motion to communicate. |
| Respond under 400ms | Doherty threshold | Panels open instantly. The post modal shows its shell and photo right away, then fills in the comments. The next post's photo is preloaded. |
| Big, near targets | Fitts's law | 48pt navigation centered on the left edge, so travel from anywhere is short. |
| Few choices at a time | Hick's law | Five destinations, three actions. Everything else is in More. |
| Recognition over recall | NN/g heuristic 6 | A tooltip on every symbol, a preview card on every profile link, stats on tile hover. |
| User control and freedom | NN/g heuristic 3 | Esc, a click outside, and Back all close the modal. The address always points at the open post, so links can be shared and new-tab clicks still work. |
| System status | NN/g heuristic 1 | Selected tab is tinted, reactions update at once, loading shows placeholders of the final shape. |
| Group what belongs together | Gestalt: common region | One capsule for destinations, separate circles for actions, the kit's vertical tab bar. |

## Performance budget for motion

- Animate `opacity` and `transform` only, 150 to 300ms.
- Hover effects use CSS. Only the profile preview uses JS: one shared element and delegated listeners, skipped on touch screens.
- Blur only on floating controls and the modal backdrop. Tooltips and the preview card are opaque, so they add no blur layer.
- Nothing animates on page load. The heart spring is added on demand.

## Layout

| Width | Navigation | Content |
|---|---|---|
| under 1024px | Glass top bar, floating Tab Bar with detached search circle (kit: Tab Bar - iPhone) | One column, media edge to edge |
| 1024px and up | Floating vertical tab bar, centered (kit: Tab Bar - iPhone Duo), detached circles for actions, Messages pill bottom right | Feed 540px, suggestions 320px from 1280px; grids up to 1408px |

## Components

| Thing | Value | Source |
|---|---|---|
| Tab capsule | 56pt wide, 48pt items, tinted symbol on a vibrant fill when selected | Kit: Tab Bars |
| Segmented control | Glass capsule, 36pt items, sticks while scrolling | Kit: Segmented Controls |
| Buttons | Capsules: 28, 34, 50pt | Kit: Buttons |
| Text fields | Filled, borderless, capsule search | Kit: Text Fields |
| Menus, panels | Thick glass, 28pt radius, 40pt rows | Kit: Menus, Materials |
| Post modal | 28pt radius, photo fits its own ratio (0.75 to 1.6), 416pt panel | Kit: Sheets |
| Carousel dots | 6pt, tint when current, white over photos | Kit: Page Controls |
| Lists | Inset grouped on `bg-grouped` | Kit: Lists |
| Group icons | 72pt, 18pt radius | Kit: App Icons |
| Grid | 3 to 5 columns of 3:4 tiles, 1px gap | Content first |
