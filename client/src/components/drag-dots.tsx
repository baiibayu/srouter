// Shared drag-handle glyph (also used by the Embeddings provider list, so the
// two reorder surfaces look identical). Lives in its own module: it is data,
// not a component, and model-table.tsx must export only components
// (react-refresh fast refresh).
export const dragDots = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
)
