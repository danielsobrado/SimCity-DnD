# Tree impostor fallback behavior

Textured tree impostor atlases load asynchronously after the source tree prototypes are ready.
Until the atlases are validated and resident, the renderer keeps the normal low-poly tree proxy
for the impostor band. It does not expose the old solid cross-card canopy and full-bounds trunk
box, which produced oversized brown blocks at the horizon.

Atlas albedo and normal textures are requested concurrently and include the manifest generation
time as a cache version. A refreshed offline bake therefore cannot silently reuse stale browser
cache entries.

The textured impostor path remains the steady-state far-tree representation. The proxy fallback
is used only while loading or when the atlas manifest or textures fail validation or loading.
