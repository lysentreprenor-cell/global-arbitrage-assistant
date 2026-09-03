# Meridian — Finlys Design System

**v1.0** · owner: product design · consumers: every screen in `client/src`

Meridian is the visual and behavioural contract for Finlys. It exists so that
a screen built by one person in one week looks and behaves like a screen built
by another person six months later.

---

## 1. Why it looks like this

Finlys handles money and contracts. That constrains the design far more than
taste does.

| Principle | What it means on screen |
|---|---|
| **Calm beats impressive** | Ink canvas, flat surfaces, no glow. Glowing gradients are the visual language of crypto casinos; quiet luminance steps are the language of a bank. |
| **One accent, spent carefully** | Each theme has exactly one accent, used for the primary action, the active state and the focus ring. If three things glow, nothing is important. |
| **Colour carries meaning** | Green = money in. Red = money out or danger. Amber = pending. Accent = the action we want you to take. A colour that means nothing is not allowed. |
| **Spending is not an alarm** | Outflow is a muted terracotta, not fire-engine red. Screaming at someone for buying coffee trains anxiety, then blindness. |
| **Numbers are typeset, not decorated** | Balances are solid, high-contrast and tabular. Never gradient-clipped, never blurred. Legibility *is* the trust signal. |
| **One primary action per screen** | Two equally loud calls to action in a money flow is how people send the wrong amount to the wrong person. |
| **Redundant state encoding** | Active nav is colour *and* a marker. Amount sign is colour *and* a glyph. Nothing depends on colour vision alone. |
| **Progressive disclosure** | The home screen answers "how much do I have" first and everything else on demand. Eight equally loud tiles makes the user do the product's triage. |

---

## 2. The layers

```
design/tokens.ts      primitives   space · radius · type · elevation · motion · layers
design/themes.ts      semantics    4 palettes + CSS-variable publishing
design/bridge.ts      compatibility maps a palette onto the legacy `th.*` object
design/primitives.tsx components   the parts screens are built from
index.css             CSS layer    first-paint fallbacks, base elements, utilities
```

One palette drives three consumers so they cannot drift:

1. `useTheme().th` — what React components read
2. `--md-*` CSS variables — for hand-written styles and legacy screens
3. shadcn `--background` / `--primary` / … — for the Tailwind component layer

`ThemeProvider` writes 2 and 3 onto `:root` on every theme change.

---

## 3. Tokens

**Space** — 4pt grid: `2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48`.
The screen gutter is always `20`. Do not invent values.

**Radius** — `8` chips · `12` icon tiles · `16` inputs and buttons ·
`20` cards · `28` hero cards and sheets · `999` pills.
Radius follows nesting depth: a child is never rounder than its parent.

**Type** — two families, one ramp.
Outfit for UI text, Sora for numerals, balances and headings.
Hierarchy comes from size, weight and colour — never from decoration.
Every number renders with tabular figures so columns align and a live
balance does not shuffle as it updates.

**Elevation** — `flat · low · medium · high · overlay`. Shadow only seats a
surface; luminance does the actual depth work, so the hierarchy survives a
greyscale screenshot.

**Motion** — `120ms` press · `180ms` default · `260ms` enter · `400ms` theme
cross-fade, on `cubic-bezier(0.2, 0, 0, 1)`. `prefers-reduced-motion` is
honoured globally in `index.css`.

**Touch** — 44px minimum on every interactive element. No exceptions.

---

## 4. Themes

Four themes, one structure — the same system rotated to a different hue.
Semantic colours (positive / negative / warning / info / danger) are
**identical across all four**: a user who learns "green means in" must never
have to relearn it.

| id | name | canvas | accent |
|---|---|---|---|
| `black-gold` | Meridian Ink | ink navy | brass |
| `ice-silver` | Nordic Frost | cold slate | steel blue |
| `emerald-gold` | Vault Green | deep pine | emerald |
| `royal-violet` | Midnight Indigo | violet ink | iris |

Adding a theme means filling in the `Palette` shape in `themes.ts`. It never
means inventing new roles. The ids are unchanged from the pre-Meridian app so
saved user preferences keep working; `LEGACY_MAP` in `ThemeContext` covers the
older ids still in the database.

---

## 5. Components

```
Layout      Screen · Section · Stack · Row · Divider · Spacer
Surface     Card · Tile · ListRow · Avatar
Text        Text · Eyebrow · Amount · Delta
Action      Button · IconButton · Chip · SegmentedControl
Feedback    Badge · Meter · EmptyState · Skeleton · Spinner · Sheet
```

Notable contracts:

- **`Amount`** is the only correct way to render money. It handles tabular
  figures, the sign glyph, in/out colouring, the muted currency code and
  privacy masking.
- **`Button`** — one `primary` per screen. `secondary` for the alternative,
  `ghost` for tertiary, `danger` for destructive.
- **`IconButton`** requires a `label`. An icon-only control must still say
  what it does.
- **`Sheet`** — bottom sheets, not centre modals. On a phone the bottom is
  where the thumb already is, and the context you came from stays visible
  behind it, which matters when the context is money.
- **`Meter`** is always paired with a number. A bar on its own is a vibe.

**The rule:** if a screen needs something these do not offer, add a variant
here — never a one-off style in the screen. That single rule is the difference
between an app that looks designed and an app that looks accumulated.

---

## 6. Migration status

| State | Screens |
|---|---|
| **On the system** | Home (`Dashboard`), `BottomNav`, `FloatingTopPanel`, `ThemeSwitcher`, `Preferences` theme picker |
| **Themed via tokens** | Every screen: colours were migrated to `--md-*` variables and the `th.*` bridge, so all of them follow the active theme |
| **Not yet rebuilt on primitives** | `TransferFlow`, `WalletTopUp`, `AgreementNew`, `AgreementDetail`, `Invest`, `AIContracts`, `Cards`, `ContactSelection`, `Messages`, `Security` and the remaining flows — correct colours, but still hand-rolled layout and typography |

When rebuilding one of those screens:

1. Replace the outer wrapper with `<Screen>`.
2. Replace hand-rolled boxes with `Card`, groups with `Section`.
3. Replace every money string with `<Amount>`.
4. Delete the local style objects. If something is missing, add it here.
5. Keep every `data-testid` exactly as it is.

---

## 7. Rules of thumb

- No new hex colours in screens. Ever. Use a token.
- No new font sizes. Use the ramp.
- No spacing outside the 4pt grid.
- If a colour on screen means nothing, remove it.
- Do not animate anything longer than 400ms.
- Every interactive element gets a visible focus ring — the global
  `:focus-visible` style already provides it; do not remove outlines.
