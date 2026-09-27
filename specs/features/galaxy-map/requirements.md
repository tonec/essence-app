# Requirements: Galaxy Map

## User interaction

### Pan & Zoom

Smooth night-sky pan/zoom (PixiJS) rendered via the gnomonic projection in _How the star map should be generated from the star catalog data_. The camera has three inputs: right-ascension center `α₀`, declination center `δ₀`, and zoom scale `R`.

### View Modes

#### *High Zoom (large R):*

Shows individual pixel structures on claimed stars, animated blocks, and star glow.




#### *Low Zoom (small R):*

Merges structures into glowing constellation nodes for performance optimization.
## Star Point Data - JSON keys and additional information

Shipped under `src/lib/galaxy/` with the following files:
  - `bsc5p_3d.json` — star coordinates (`x`, `y`, `z` in parsecs), luminosity, colour.
  - `bsc5p_names.json` — additional names.
  - `bsc5p_spectral_extra.json` — spectral information including apparent magnitude `b` (used for tiering).
  - `catalog.json` — merged view produced by `scripts/build-catalog.mjs` (see that script's `SOURCES` config to change what's included). This is what runtime code should load. Ship as a static asset (gzipped is ~200 KB).

  > Note: the upstream BSC5P dataset also ships a `bsc5p_radec.json` (right-ascension/declination form). It is **not** included here; RA/Dec are computed at load time from the `x/y/z` fields (see Step 1 of _How the star map should be generated from the star catalog data_).
  >
  > Axis order: the catalog's `x/y/z` are not equatorial as-is. Equatorial `(X, Y, Z)` = catalog `(z, −y, x)`, with `+Z` the north celestial pole. Remap before applying Step 1 of _How the star map should be generated from the star catalog data_. The map is drawn as seen from the ground, with north up and east on the **left** (screen x runs opposite to the projected `u`).

Because this catalog primarily targets video games, things are kept small for faster loading and efficient usage of bandwidth. JSON keys are usually a single character (2 characters for `to` / `or` field in the `spectral_extra` file). This often reduces each file by over 50% which, due to the massive amount of star data, equates to megabytes for some files.

The table below describes what each of these keys mean, and lists the files that use them.

| Key  | Type           | Symbol | Used by                                         | Description                                                                                                                                                                           |
| :--- | :------------- | :----- | :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `i`  | number, string | --     | `bsc5p_3d` `bsc5p_names` `bsc5p_spectral_extra` | Original BSC5P line ID, or 'Custom [n]' if added via the amendments mechanism. Used to link stars between files. This is the canonical **claim identity** (`stars.id`).               |
| `n`  | string         | --     | `bsc5p_3d`                                      | A single name given to star. Additional known names for each star stored in `bsc5p_names.json`.                                                                                       |
| `p`  | number         | `pc`   | `bsc5p_3d`                                      | Distance in parsecs, ignoring uncertainty. 1 parsec ≈ 3.26 light-years.                                                                                                               |
| `x`  | number         | --     | `bsc5p_3d`                                      | `x` coordinate approximation in parsecs. Fed into the gnomonic projection (_How the star map should be generated from the star catalog data_).                                        |
| `y`  | number         | --     | `bsc5p_3d`                                      | `y` coordinate approximation in parsecs. Fed into the gnomonic projection (_How the star map should be generated from the star catalog data_).                                        |
| `z`  | number         | --     | `bsc5p_3d`                                      | `z` coordinate approximation in parsecs. Fed into the gnomonic projection (_How the star map should be generated from the star catalog data_).                                        |
| `N`  | number         | `L☉`   | `bsc5p_3d`                                      | Naively calculated luminosity. Used for star size / brightness falloff (see [Inverse Square Law of Brightness](http://www.astronomy.ohio-state.edu/~pogge/Ast162/Unit1/bright.html)). |
| `K`  | vector3        | `K`    | `bsc5p_3d`                                      | Colour of star approximated from star temperature (blackbody) converted to RGB.                                                                                                       |


**Spectral information**

Below follows extra spectral information only found in the `bsc5p_spectral_extra` file.

| Key  | Type           | Symbol      | Description                                                                                                                                        |
| ---- | -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `L`  | number         | `L☉`        | Real luminosity as determined by academic sources. Very few stars in this catalog have this value defined due to the difficulty in determining it. |
| `b`  | number         | `m`, `vMag` | Apparent brightness (apparent magnitude). **Drives tier assignment** (see _Coordinate Pricing Tiers_). Lower = brighter.                           |
| `a`  | number         | `M`, `VMag` | Naively calculated absolute magnitude. This does not take dust and other obstruction into account.                                                 |
| `g`  | string         | --          | Colour or glow of star, but cartoony instead of real.                                                                                              |
| `s`  | string         | --          | Spectral classification.                                                                                                                           |
| `C`  | string         | --          | Spectral type classification (O, B, A, F, G, K, M).                                                                                                |
| `S`  | number         | --          | Spectral type subclass (0-9). 0=hottest, 9=coldest. Fractions exist (eg. Mu Normae is O9.7 \[that's an `O`, not a `0`]).                           |
| `L`  | number         | --          | Luminosity class. Higher numbers generally mean lower surface temperatures.                                                                        |
| `to` | object or null | --          | If specified, the star is in range of the above and whatever is specified here. Used to indicate uncertainty.                                      |
| `or` | object or null | --          | If specified, the star is either the above or whatever is specified in this object. Used to indicate uncertainty.                                  |
| `e`¹ | array          | --          | Containing siblings, if the original data was presented that way.                                                                                  |
| `q`  | string         | --          | Skipped spectral information. These usually contain peculiarities in spectral lines, but may also contain data the parser did not understand.      |

## How the star map should be generated from the star catalog data

For a zoomable "Night Sky View" centered on a specific point in the sky, the absolute best method is the Gnomonic Projection.
While a Stereographic projection is excellent for viewing an entire hemisphere at once, a Gnomonic projection perfectly mimics looking through a camera lens or a telescope. When you change the focal length (zoom in and out), the geometry stays perfectly uniform without bending constellations at the edges of your view.
Alternatively, if you want a projection that doesn't distort shapes near the edges when zoomed far out, the Stereographic Projection is your best secondary choice.
Here is how to structure your math to handle both the celestial conversion and the dynamic zooming.

Step 1: Convert XYZ to Angles (Right Ascension & Declination)
First, turn your raw Cartesian 3D coordinates into spherical coordinates.

1.  Distance ($r$): $\sqrt{X^2 + Y^2 + Z^2}$
2.  Declination ($\delta$): $\arcsin(Z / r)$
3.  Right Ascension ($\alpha$): $\operatorname{atan2}(Y, X)$

Step 2: Center the View (Camera Target)
Because the user is looking at a specific patch of sky and zooming in, you must define where the "camera" is pointing. Let this center point be $(\alpha_0, \delta_0)$.
When the user pans across the night sky, you will update $\alpha_0$ and $\delta_0$.

Step 3: Compute the 2D Projection with Zoom
Use the Gnomonic math combined with a scale factor ($R$) to act as your zoom controller.
First, calculate the angular distance component ($c$) between the star and the center of your screen:
$$\cos(c) = \sin(\delta_0)\sin(\delta) + \cos(\delta_0)\cos(\delta)\cos(\alpha - \alpha_0)$$
If $\cos(c) \le 0$, the star is more than 90° away from the center point (behind the local horizon of your screen view) and should not be rendered.
If it is visible, calculate your 2D $(u, v)$ coordinates:
$$u = \frac{R \cdot \cos(\delta)\sin(\alpha - \alpha_0)}{\cos(c)}$$
$$v = \frac{R \cdot \big(\cos(\delta_0)\sin(\delta) - \sin(\delta_0)\cos(\delta)\cos(\alpha - \alpha_0)\big)}{\cos(c)}$$

How to Handle the Zoom Factor ($R$)

- Zooming In: Increase the value of $R$. This stretches the coordinates outward, scattering the stars further apart and magnifying the center patch of sky.
- Zooming Out: Decrease the value of $R$. This pulls coordinates closer to the origin $(0,0)$, packing more stars onto the screen.