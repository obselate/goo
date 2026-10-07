package Goo

import System

/// Selects a native material behind the window's rendered content.
public enum WindowBackdrop {
  /// No native background effect.
  None;
  /// Requests compositor blur of the desktop behind this window.
  Blur;
}

/// Selects a Windows 11 system backdrop material.
public enum WindowsBackdropMaterial {
  /// Blurs the desktop using Acrylic.
  Acrylic;
  /// Lets DWM choose a material, which may cover only the titlebar or be absent.
  Automatic;
  /// Uses the wallpaper-based Mica material.
  Mica;
  /// Uses the alternate Mica material for tabbed windows.
  MicaAlt;
}

/// Configures the native material for this window on Windows. Other platforms ignore it.
public data struct WindowsBackdropOptions {
  private var material WindowsBackdropMaterial

  /// Gets the material. The default is Acrylic.
  public prop Material WindowsBackdropMaterial {
    get -> material
    init {
      if uint32(value) > uint32(WindowsBackdropMaterial.MicaAlt) { throw ArgumentOutOfRangeException("value") }
      material = value
    }
  }
}

/// Selects a semantic AppKit backdrop material. Appearance follows macOS policy.
public enum MacOSBackdropMaterial {
  /// Uses the material behind window backgrounds. This is the default.
  UnderWindowBackground;
  /// Uses the titlebar material.
  Titlebar = 3;
  /// Uses the selection material.
  Selection = 4;
  /// Uses the menu material.
  Menu = 5;
  /// Uses the popover material.
  Popover = 6;
  /// Uses the sidebar material.
  Sidebar = 7;
  /// Uses the header material.
  HeaderView = 10;
  /// Uses the sheet material.
  Sheet = 11;
  /// Uses the window background material.
  WindowBackground = 12;
  /// Uses the heads-up display material.
  HudWindow = 13;
  /// Uses the fullscreen interface material.
  FullScreenUI = 15;
  /// Uses the tooltip material.
  ToolTip = 17;
  /// Uses the content background material.
  ContentBackground = 18;
  /// Uses the material beneath page backgrounds.
  UnderPageBackground = 22;
}

/// Controls whether an AppKit backdrop uses its active or inactive appearance.
public enum MacOSBackdropState {
  /// Follows native window activation. This is the default.
  FollowWindow;
  /// Uses the active material appearance.
  Active;
  /// Uses the inactive material appearance.
  Inactive;
}

/// Owns an immutable alpha mask for a native macOS backdrop, stretched to its bounds.
public class WindowBackdropMask {
  internal let Pixels []uint8

  /// Gets the mask width in pixels.
  public prop Width int32 { get; private set }
  /// Gets the mask height in pixels.
  public prop Height int32 { get; private set }

  /// Copies a row-major alpha mask. Zero hides the material and 255 fully shows it.
  /// @param width The positive pixel width.
  /// @param height The positive pixel height.
  /// @param alpha Exactly width times height alpha bytes, starting at the top-left.
  public init(width int32, height int32, alpha []uint8) {
    if width <= 0 { throw ArgumentOutOfRangeException("width") }
    if height <= 0 { throw ArgumentOutOfRangeException("height") }
    if Object.ReferenceEquals(alpha, nil) { throw ArgumentNullException("alpha") }
    let count = int64(width) * int64(height)
    if count > int64(Int32.MaxValue) / 4 || count != alpha.Length {
      throw ArgumentException("Alpha must exactly fill a mask that fits in an RGBA buffer", "alpha")
    }
    Width = width
    Height = height
    Pixels = [int32(count) * 4]uint8
    for i in 0 ... alpha.Length {
      let offset = i * 4
      Pixels[offset] = alpha[i]
      Pixels[offset + 1] = alpha[i]
      Pixels[offset + 2] = alpha[i]
      Pixels[offset + 3] = alpha[i]
    }
  }
}

/// Configures this window's behind-window AppKit effect. Other platforms ignore it.
public data struct MacOSBackdropOptions {
  private var material MacOSBackdropMaterial
  private var state MacOSBackdropState
  private var emphasized bool
  private var mask WindowBackdropMask?

  /// Gets the semantic material. Some materials are opaque. Defaults to UnderWindowBackground.
  public prop Material MacOSBackdropMaterial {
    get -> material
    init {
      if !Enum.IsDefined[MacOSBackdropMaterial](value) { throw ArgumentOutOfRangeException("value") }
      material = value
    }
  }
  /// Gets the activation policy. Defaults to FollowWindow and still respects accessibility settings.
  public prop State MacOSBackdropState {
    get -> state
    init {
      if uint32(value) > uint32(MacOSBackdropState.Inactive) { throw ArgumentOutOfRangeException("value") }
      state = value
    }
  }
  /// Gets whether the native material uses its emphasized appearance.
  public prop Emphasized bool { get -> emphasized init -> emphasized = value }
  /// Gets the alpha mask, or nil for the full view. This masks the material, not Goo content or input.
  public prop Mask WindowBackdropMask? { get -> mask init -> mask = value }
}

/// Configures this window's Wayland background effect. Other platforms ignore it.
public data struct WaylandBackdropOptions {
  private var region ElementRect?
  private var cornerRadius float64

  /// Gets the blur region corner radius in logical pixels. Defaults to zero and clamps to half the region size.
  public prop CornerRadius float64 {
    get -> cornerRadius
    init {
      if !Double.IsFinite(value) || value < 0 { throw ArgumentOutOfRangeException("value") }
      cornerRadius = value
    }
  }

  /// Gets a surface-local rectangle in logical pixels, or nil for the whole window.
  /// Coordinates and sizes must be nonnegative and fit in signed 32-bit surface coordinates.
  /// Fractional bounds round outward. A zero width or height removes blur. The compositor clips to the surface.
  public prop Region ElementRect? {
    get -> region
    init {
      if let rect = value {
        if !Double.IsFinite(rect.X) || !Double.IsFinite(rect.Y)
          || !Double.IsFinite(rect.Width) || !Double.IsFinite(rect.Height)
          || rect.X < 0 || rect.Y < 0 || rect.Width < 0 || rect.Height < 0
          || rect.X + rect.Width > Int32.MaxValue || rect.Y + rect.Height > Int32.MaxValue {
          throw ArgumentOutOfRangeException("value")
        }
      }
      region = value
    }
  }
}

/// Configures native desktop materials independently of widget shader effects.
public partial class Window {
  private var backdrop WindowBackdrop
  private var backdropFallbackColor Color = Color.Black
  private var windowsBackdrop WindowsBackdropOptions
  private var macOSBackdrop MacOSBackdropOptions
  private var waylandBackdrop WaylandBackdropOptions

  /// Gets or sets Windows-only material options. Changes apply to an open window immediately.
  public prop WindowsBackdrop WindowsBackdropOptions {
    get -> windowsBackdrop
    set(value) {
      requireUiThread("Window.WindowsBackdrop")
      if windowsBackdrop == value { return }
      if let native = host as SdlHost? {
        native.SetBackdrop(backdrop == WindowBackdrop.Blur, value, macOSBackdrop, waylandBackdrop)
      }
      windowsBackdrop = value
      requestRender()
    }
  }

  /// Gets or sets macOS-only material, activation, emphasis and mask options. Changes apply immediately.
  /// The native view samples behind the window. Use Style.ShaderEffect to sample Goo content within it.
  public prop MacOSBackdrop MacOSBackdropOptions {
    get -> macOSBackdrop
    set(value) {
      requireUiThread("Window.MacOSBackdrop")
      if macOSBackdrop == value { return }
      if let native = host as SdlHost? {
        native.SetBackdrop(backdrop == WindowBackdrop.Blur, windowsBackdrop, value, waylandBackdrop)
      }
      macOSBackdrop = value
      requestRender()
    }
  }

  /// Gets or sets Wayland-only blur region options. Changes apply on the next surface commit.
  public prop WaylandBackdrop WaylandBackdropOptions {
    get -> waylandBackdrop
    set(value) {
      requireUiThread("Window.WaylandBackdrop")
      if waylandBackdrop == value { return }
      if let native = host as SdlHost? {
        native.SetBackdrop(backdrop == WindowBackdrop.Blur, windowsBackdrop, macOSBackdrop, value)
      }
      waylandBackdrop = value
      requestRender()
    }
  }

  /// Gets or sets the native desktop material. Blur requests per-pixel transparency at Open.
  /// Enable transparency before opening a window that will toggle blur at runtime.
  /// Native policy controls the appearance. Unsupported hosts use BackdropFallbackColor.
  public prop Backdrop WindowBackdrop {
    get -> backdrop
    set(value) {
      requireUiThread("Window.Backdrop")
      if value != WindowBackdrop.None && value != WindowBackdrop.Blur {
        throw ArgumentOutOfRangeException("value")
      }
      if backdrop == value { return }
      if let native = host as SdlHost? {
        if value == WindowBackdrop.Blur && !native.Transparent {
          throw InvalidOperationException("Enable transparency before opening a window that will use backdrop blur")
        }
        native.SetBackdrop(value == WindowBackdrop.Blur, windowsBackdrop, macOSBackdrop, waylandBackdrop)
      }
      backdrop = value
      requestRender()
    }
  }

  /// Reports whether the open native host accepts blur and currently advertises support.
  /// The compositor can still vary or suppress its material according to system policy.
  public prop BackdropAvailable bool {
    get -> backdrop == WindowBackdrop.Blur && (host as SdlHost?)?.BackdropAvailable == true
  }

  /// Gets or sets the opaque window background used when requested blur is unavailable.
  /// Defaults to black. Foreground content is rendered over this color normally.
  public prop BackdropFallbackColor Color {
    get -> backdropFallbackColor
    set(value) {
      requireUiThread("Window.BackdropFallbackColor")
      if value.A != 1.0F { throw ArgumentException("Backdrop fallback must be opaque", "value") }
      if backdropFallbackColor == value { return }
      backdropFallbackColor = value
      requestRender()
    }
  }

  private prop RenderBackground Color {
    get -> backdrop == WindowBackdrop.Blur && !BackdropAvailable ? backdropFallbackColor : Background
  }
}
