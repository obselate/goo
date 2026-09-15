package GooGallery

import Goo
import System.Collections.Generic

internal class GalleryNavigationView {
    shared {
        private func ChapterTab(
            label string,
            targetIndex int32,
            isActive bool,
            onSelect Action[int32]
        ) Button -> Button{
            Key: "chapter-tab-" + targetIndex.ToString(),
            Height: 28,
            PaddingLeft: 10,
            PaddingRight: 10,
            BackgroundColor: if isActive {
                GalleryTheme.SurfaceRaised
            } else {
                Color.Transparent
            },
            BorderWidth: 1,
            BorderColor: if isActive {
                GalleryTheme.BorderStrong
            } else {
                Color.Transparent
            },
            BorderRadius: 6,
            Cursor: Cursor.Pointer,
            Focusable: true,
            TransitionMs: 100.0,
            Hover: Style{BackgroundColor: GalleryTheme.SurfaceRaised, BorderColor: GalleryTheme.Border,},
            OnClick: func () {
                onSelect(targetIndex)
            },
            JustifyContent: JustifyContent.Center,
            AlignItems: AlignItems.Center,
            Text{
                Content: label,
                FontSize: 11,
                FontWeight: if isActive {
                    700
                } else {
                    500
                },
                Color: if isActive {
                    GalleryTheme.Ink
                } else {
                    GalleryTheme.InkMuted
                },
                TextAlign: TextAlign.Center,
            },
        }

        private func WindowControl(
            icon string,
            label string,
            danger bool,
            window Window?,
            onClick Action
        ) Button -> Button{
            Key: "window-control-" + label,
            Width: 30,
            Height: 30,
            BackgroundColor: Color.Transparent,
            BorderWidth: 1,
            BorderColor: Color.Transparent,
            BorderRadius: 4,
            Cursor: Cursor.Pointer,
            Focusable: true,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            TransitionMs: 80.0,
            Hover: Style{
                BackgroundColor: if danger {
                    Color.Rgb(127, 29, 29)
                } else {
                    GalleryTheme.SurfaceRaised
                },
                BorderColor: if danger {
                    Color.Rgb(185, 28, 28)
                } else {
                    GalleryTheme.Border
                },
            },
            Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: label,},
            OnClick: onClick,
            GalleryTheme.Icon(
                icon,
                17,
                if danger {
                    Color.Rgb(248, 113, 113)
                } else {
                    GalleryTheme.InkMuted
                }
            ),
        }

        private func RailSectionHeader(title string, itemKey string) Container -> Container{
            Key: itemKey,
            Width: Length.Percent(100),
            PaddingTop: 10,
            PaddingBottom: 4,
            PaddingLeft: 8,
            Text{Content: title, FontSize: 9, FontWeight: 800, LetterSpacing: 1.2, Color: GalleryTheme.InkSubtle,},
        }

        private func RailItem(
            catalog GalleryCatalog,
            index int32,
            currentShowcase int32,
            onSelect Action[int32]
        ) Button {
            let showcase = catalog.Showcases[index]
            let isActive = currentShowcase == index
            return Button{
                Key: "rail-item-" + index.ToString(),
                Width: Length.Percent(100),
                Height: 30,
                PaddingLeft: 8,
                PaddingRight: 8,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.FlexStart,
                Position: PositionType.Relative,
                BackgroundColor: if isActive {
                    GalleryTheme.SurfaceRaised
                } else {
                    Color.Transparent
                },
                BorderRadius: 4,
                Cursor: Cursor.Pointer,
                Focusable: true,
                TransitionMs: 100.0,
                Hover: Style{BackgroundColor: GalleryTheme.SurfaceRaised,},
                OnClick: func () {
                    onSelect(index)
                },
                Container{
                    Key: "active-marker",
                    Display: if isActive {
                        Display.Flex
                    } else {
                        Display.None
                    },
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 5,
                    Bottom: 5,
                    Width: 2,
                    BorderRadius: 1,
                    BackgroundColor: GalleryTheme.Accent,
                    HitTestSelf: false,
                },
                Text{
                    Key: "index",
                    Content: (index + 1).ToString("D2"),
                    FlexShrink: 0.0,
                    FontSize: 10,
                    FontWeight: 700,
                    Color: if isActive {
                        GalleryTheme.AccentStrong
                    } else {
                        GalleryTheme.InkSubtle
                    },
                    MarginRight: 8,
                },
                Text{
                    Key: "title",
                    Content: showcase.Title,
                    MinWidth: 0,
                    FlexGrow: 1.0,
                    FlexShrink: 1.0,
                    FontSize: 11,
                    FontWeight: if isActive {
                        650
                    } else {
                        450
                    },
                    Color: if isActive {
                        GalleryTheme.Ink
                    } else {
                        GalleryTheme.InkMuted
                    },
                    TextTrimming: TextTrimming.Ellipsis,
                    TextMaxLines: 1,
                },
            }
        }

        internal func TopBar(
            catalog GalleryCatalog,
            currentShowcase int32,
            compact bool,
            window Window?,
            onSelect Action[int32]
        ) Container {
            let currentChapter = catalog.Showcases[currentShowcase].Chapter
            let tabs = List[Blob]()
            let overview = catalog.FirstShowcase(-1)
            tabs.Add(ChapterTab("Overview", overview, currentShowcase == overview, onSelect))
            var chapterIndex int32 = 0
            while chapterIndex < catalog.Chapters.Length {
                let chapter = catalog.Chapters[chapterIndex]
                let target = catalog.FirstShowcase(chapterIndex)
                tabs.Add(ChapterTab(chapter.TabLabel, target, currentChapter == chapterIndex, onSelect))
                chapterIndex = chapterIndex + 1
            }
            let bar = Container{
                Key: "gallery-top-bar",
                Width: Length.Percent(100),
                Height: 48,
                MinHeight: 48,
                PaddingLeft: if compact {
                    16
                } else {
                    20
                },
                PaddingRight: 6,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                BackgroundColor: GalleryTheme.Surface,
                BorderBottomWidth: 1,
                BorderColor: GalleryTheme.Border,
                Container{
                    Key: "gallery-brand",
                    FlexDirection: FlexDirection.Row,
                    AlignItems: AlignItems.Center,
                    Text{Content: "Goo UI gallery", FontSize: 13, FontWeight: 700, Color: GalleryTheme.Ink,},
                },
                Container{
                    Key: "gallery-tabs",
                    FlexDirection: FlexDirection.Row,
                    AlignItems: AlignItems.Center,
                    Gap: 4,
                    Children: tabs,
                },
                Container{
                    Key: "gallery-window-controls",
                    FlexDirection: FlexDirection.Row,
                    AlignItems: AlignItems.Center,
                    Gap: 2,
                    WindowControl(
                        GalleryTheme.IconMinimize,
                        "Minimize",
                        false,
                        window,
                        () -> {
                            if let target = window {
                                target.State = WindowState.Minimized
                            }
                        }
                    ),
                    WindowControl(
                        GalleryTheme.IconMaximize,
                        "Maximize or restore",
                        false,
                        window,
                        () -> {
                            if let target = window {
                                target.State = if target.State == WindowState.Maximized {
                                    WindowState.Normal
                                } else {
                                    WindowState.Maximized
                                }
                            }
                        }
                    ),
                    WindowControl(
                        GalleryTheme.IconClose,
                        "Close",
                        true,
                        window,
                        func () {
                            window?.RequestClose()
                        }
                    ),
                },
            }
            return Window.DragRegion(bar)
        }

        internal func Rail(
            catalog GalleryCatalog,
            currentShowcase int32,
            compact bool,
            onSelect Action[int32]
        ) Container {
            let items = List[Blob]()
            let overview = catalog.FirstShowcase(-1)
            items.Add(RailSectionHeader("OVERVIEW", "rail-section-overview"))
            items.Add(RailItem(catalog, overview, currentShowcase, onSelect))
            var chapterIndex int32 = 0
            while chapterIndex < catalog.Chapters.Length {
                let chapter = catalog.Chapters[chapterIndex]
                items.Add(RailSectionHeader(chapter.RailLabel, "rail-section-" + chapterIndex.ToString()))
                var showcaseIndex int32 = 0
                while showcaseIndex < catalog.Showcases.Length {
                    if catalog.Showcases[showcaseIndex].Chapter == chapterIndex {
                        items.Add(RailItem(catalog, showcaseIndex, currentShowcase, onSelect))
                    }
                    showcaseIndex = showcaseIndex + 1
                }
                chapterIndex = chapterIndex + 1
            }
            return Container{
                Key: "gallery-rail",
                Width: 220,
                Height: Length.Percent(100),
                Display: if compact {
                    Display.None
                } else {
                    Display.Flex
                },
                FlexDirection: FlexDirection.Column,
                BackgroundColor: GalleryTheme.SidebarBackground,
                BorderRightWidth: 1,
                BorderColor: GalleryTheme.Border,
                OverflowY: Overflow.Scroll,
                PaddingTop: 6,
                PaddingBottom: 16,
                PaddingLeft: 6,
                PaddingRight: 6,
                Gap: 1,
                Children: items,
            }
        }

        internal func StatusBar(catalog GalleryCatalog, currentShowcase int32, compact bool) Container {
            let showcase = catalog.Showcases[currentShowcase]
            var sentence = catalog.OpeningSentence
            if showcase.Chapter >= 0 {
                sentence = catalog.Chapters[showcase.Chapter].Sentence
            }
            return Container{
                Key: "gallery-status-bar",
                Width: Length.Percent(100),
                Height: 26,
                MinHeight: 26,
                PaddingLeft: if compact {
                    20
                } else {
                    28
                },
                PaddingRight: if compact {
                    16
                } else {
                    20
                },
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.FlexStart,
                BackgroundColor: GalleryTheme.Surface,
                BorderTopWidth: 1,
                BorderColor: GalleryTheme.Border,
                Text{
                    Content: sentence,
                    FontSize: 11,
                    Color: GalleryTheme.InkMuted,
                    TextTrimming: TextTrimming.Ellipsis,
                    TextMaxLines: 1,
                },
            }
        }
    }
}
