package GooGallery

import Goo
import System

class GalleryCell : Cell, IDisposable {
    private let rootHandle ElementHandle
    private let showcaseHandle ElementHandle
    private let catalog GalleryCatalog
    private let rootMetricsHandler Action[ElementMetrics]
    private var attachedWindow Window?
    private var Compact bool
    private var currentShowcase int32
    private var disposed bool

    public init() {
        rootHandle = ElementHandle{}
        showcaseHandle = ElementHandle{}
        catalog = GalleryCatalog{}
        rootMetricsHandler = (metrics ElementMetrics) -> {
            if metrics.IsMounted && metrics.BorderBox.Width > 0.0 {
                UpdateCompact(metrics.BorderBox.Width)
            }
        }
        rootHandle.MetricsChanged += rootMetricsHandler
    }

    internal func AttachWindow(window Window) {
        attachedWindow = window
    }

    /// Releases owned subscriptions and resources.
    public func Dispose() {
        if disposed {
            return
        }
        disposed = true
        rootHandle.MetricsChanged -= rootMetricsHandler
    }

    /// Gets the element handle for the root layout container.
    public func RootView() ElementHandle -> rootHandle

    /// Gets the element handle for the current full-window showcase.
    public func ShowcaseView() ElementHandle -> showcaseHandle

    /// Gets the number of individually navigable showcases.
    public func ShowcaseCount() int32 -> catalog.Showcases.Length

    /// Gets the current showcase index.
    public func CurrentShowcase() int32 -> currentShowcase

    /// Opens the showcase at the specified index.
    public func OpenShowcase(index int32) bool {
        if index < 0 || index >= catalog.Showcases.Length {
            return false
        }
        if currentShowcase != index {
            currentShowcase = index
            Rebuild()
        }
        return true
    }

    /// Opens the next showcase.
    public func NextShowcase() bool -> OpenShowcase(currentShowcase + 1)

    /// Opens the previous showcase.
    public func PreviousShowcase() bool -> OpenShowcase(currentShowcase - 1)

    /// Opens the first showcase in the named chapter.
    public func OpenSection(name string) bool {
        let chapter = catalog.ChapterIndex(name)
        let index = catalog.FirstShowcase(chapter)
        return if index < 0 { false } else { OpenShowcase(index) }
    }

    /// Finds the chapter index by its route name.
    public func ChapterIndex(name string) int32 -> catalog.ChapterIndex(name)

    private func UpdateCompact(width float64) {
        let next = width < GalleryTheme.Breakpoint
        if next == Compact {
            return
        }
        Compact = next
        Rebuild()
    }

    override func Build() Blob -> Container{
        Key: "root",
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Handle: rootHandle,
        BackgroundColor: GalleryTheme.Background,
        FontFamily: GalleryTheme.GalleryFontFamily,
        BorderRadius: 8,
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Hidden,
        Position: PositionType.Relative,
        FlexDirection: FlexDirection.Column,
        OnKeyDown: func (e KeyEvent) {
            if e.Key == Key.PageUp || e.Key == Key.Left {
                e.PreventDefault()
                PreviousShowcase()
            } else if e.Key == Key.PageDown || e.Key == Key.Right {
                e.PreventDefault()
                NextShowcase()
            }
        },
        GalleryNavigationView.TopBar(
            catalog,
            currentShowcase,
            Compact,
            attachedWindow,
            (index int32) -> {
                OpenShowcase(index)
            }
        ),
        Container{
            Key: "gallery-showcase-region",
            Handle: showcaseHandle,
            Width: Length.Percent(100),
            MinHeight: 0,
            FlexGrow: 1.0,
            FlexShrink: 1.0,
            FlexDirection: FlexDirection.Row,
            BackgroundColor: GalleryTheme.Background,
            GalleryNavigationView.Rail(
                catalog,
                currentShowcase,
                Compact,
                (index int32) -> {
                    OpenShowcase(index)
                }
            ),
            Container{
                Key: "gallery-content",
                FlexGrow: 1.0,
                FlexShrink: 1.0,
                Height: Length.Percent(100),
                Position: PositionType.Relative,
                OverflowX: Overflow.Hidden,
                OverflowY: Overflow.Hidden,
                PaddingLeft: if Compact {
                    20
                } else {
                    36
                },
                PaddingRight: if Compact {
                    20
                } else {
                    36
                },
                PaddingTop: 18,
                PaddingBottom: 18,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                GalleryStageView.Build(catalog, currentShowcase, Compact),
            },
        },
        GalleryNavigationView.StatusBar(catalog, currentShowcase, Compact),
        Container{
            Key: "gallery-frame",
            Position: PositionType.Absolute,
            Left: 1,
            Top: 1,
            Right: 1,
            Bottom: 1,
            BorderWidth: 1,
            BorderColor: GalleryTheme.BorderStrong,
            BorderRadius: 7,
            HitTestSelf: false,
        },
    }
}
