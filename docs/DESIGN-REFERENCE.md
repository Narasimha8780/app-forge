# CloudOps glass dashboard refinement

The supplied 360×640 video includes a dashboard within an approximately 320×190 region. The reference cannot supply original design tokens or a pixel-perfect desktop specification. Palette samples are rendered/compressed pixel colors, including the room beneath the transparent cards.

Dominant colors measured within the dashboard region of the 0.8-second frame:

- Champagne: `#D2BEA0`
- Warm taupe: `#BCA88C`
- Amber brown: `#90775B`
- Pale sand: `#E0CFB5`
- Deep timber: `#725940`

The implementation uses these tones with transparent gradients, thin cream rims, pill-shaped controls and a 36px curved outer workspace/admin frame. Secondary text is darkened for legibility. At mobile sizes the frame uses a smaller radius and stacked navigation. Existing reduced-motion and increased-contrast preferences remain supported.

`public/images/atelier.svg` is original vector artwork depicting abstract room geometry, soft furniture and window light. It is not an extracted frame, photograph or asset from the reference. The admin image includes a copy at `admin/public/atelier.svg` so both independent Docker images can serve their background locally. Keep the copies synchronized when updating the artwork.

The dashboard keeps actual application data and support workflows. Decorative charts or fabricated performance metrics were not added.

## Screenshot layout adaptation

The workspace opens on a Dashboard tab with horizontal pill navigation, a wide requirements-coverage chart, a selected-app requirements ring, and application cards in a three-column desktop grid. Chart values come from saved readiness checks; they are not a deployment history, performance measurements or independently verified cloud readiness. The chart shows up to eight apps, while cards show all apps. Card actions open the selected app's requirements. Creating an app still opens its brief, and an account with no apps still sees the existing empty state. No demo records are inserted into user accounts.

The admin console also uses horizontal top navigation. Both dashboards retain stacked mobile layouts, reduced-motion support and their existing access controls.
