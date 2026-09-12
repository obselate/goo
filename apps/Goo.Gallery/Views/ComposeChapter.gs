package GooGallery

import System
import System.Collections.Generic
import System.Numerics
import Gsharp.Extensions.Go
import Goo

open class ComposeChapter : Cell[ComposeChapterInput], IDisposable {

  private let tiles List[GallerySpecimenTile]
  private var rotation float64
  private var posterWidth float64
  private var orientation int32
  private var shuffleState int64
  private var workerGeneration int32
  private let posterFormReflow GalleryPosterReflowItem
  private let posterAlignReflow GalleryPosterReflowItem
  private let posterFlowReflow GalleryPosterReflowItem
  private let posterGapReflow GalleryPosterReflowItem
  private let posterWrapReflow GalleryPosterReflowItem

  public init() {
    tiles = List[GallerySpecimenTile](8)
    tiles.Add(GallerySpecimenTile(index: 0, value: 1))
    tiles.Add(GallerySpecimenTile(index: 1, value: 1))
    tiles.Add(GallerySpecimenTile(index: 2, value: 2))
    tiles.Add(GallerySpecimenTile(index: 3, value: 3))
    tiles.Add(GallerySpecimenTile(index: 4, value: 5))
    tiles.Add(GallerySpecimenTile(index: 5, value: 8))
    tiles.Add(GallerySpecimenTile(index: 6, value: 13))
    tiles.Add(GallerySpecimenTile(index: 7, value: 21))
    posterFormReflow = GalleryPosterReflowItem(Animate(Point{}))
    posterAlignReflow = GalleryPosterReflowItem(Animate(Point{}))
    posterFlowReflow = GalleryPosterReflowItem(Animate(Point{}))
    posterGapReflow = GalleryPosterReflowItem(Animate(Point{}))
    posterWrapReflow = GalleryPosterReflowItem(Animate(Point{}))
    rotation = 0.0
    posterWidth = 1040.0
    orientation = 0
    shuffleState = 173
    workerGeneration = 0
  }

  /// Releases poster geometry subscriptions.
  public func Dispose() {
    posterFormReflow.Dispose()
    posterAlignReflow.Dispose()
    posterFlowReflow.Dispose()
    posterGapReflow.Dispose()
    posterWrapReflow.Dispose()
  }

  private func rotateTiles() {
    rotation = rotation + 90.0
    Rebuild()
  }

  private func cycleOrientation() {
    orientation = (orientation + 1) % 4
    Rebuild()
  }

  private func swapEnds() {
    if tiles.Count < 2 {
      return
    }
    let last = tiles.Count - 1
    let firstTile = tiles[0]
    tiles[0] = tiles[last]
    tiles[last] = firstTile
    Rebuild()
  }

  private func shuffleTiles() {
    var index = tiles.Count - 1
    while index > 0 {
      shuffleState = (shuffleState * 1103515245 + 12345) % 2147483629
      let target = int32(shuffleState % int64(index + 1))
      let moved = tiles[index]
      tiles[index] = tiles[target]
      tiles[target] = moved
      index = index - 1
    }
    Rebuild()
  }

  private async func rankTiles(generation int32) List[GalleryTileWorkerResult] {
    let count = tiles.Count
    let output = chan [GalleryTileWorkerResult](count)
    scope {
      var index int32 = 0
      while index < count {
        let tile = tiles[index]
        go GalleryRankTile(tile.Index, tile.Value, generation, output)
        index = index + 1
      }
    }

    let results = List[GalleryTileWorkerResult](count)
    var received int32 = 0
    while received < count {
      results.Add(<- output)
      received = received + 1
    }
    return results
  }

  private func runWorkers() {
    workerGeneration = workerGeneration + 1
    // Finish the worker batch before updating tiles on the UI thread.
    let results = rankTiles(workerGeneration).GetAwaiter().GetResult()
    var left int32 = 0
    while left < results.Count - 1 {
      var right = left + 1
      while right < results.Count {
        let before = results[right].Rank < results[left].Rank ||
        results[right].Rank == results[left].Rank && results[right].Index < results[left].Index
        if before {
          let result = results[left]
          results[left] = results[right]
          results[right] = result
        }
        right = right + 1
      }
      left = left + 1
    }

    let ordered = List[GallerySpecimenTile](results.Count)
    for result in results {
      for tile in tiles {
        if tile.Index == result.Index {
          ordered.Add(tile)
        }
      }
    }
    tiles.Clear()
    for tile in ordered {
      tiles.Add(tile)
    }
    Rebuild()
  }

  private func orientationName() string {
    if orientation == 0 {
      return "landscape"
    }
    if orientation == 1 {
      return "portrait"
    }
    if orientation == 2 {
      return "landscape flipped"
    }
    return "portrait flipped"
  }

  private func tileContent() Blob {
    let shownRotation = int32(rotation) % 360
    let controls = Container{
      FlexDirection: FlexDirection.Row,
      FlexWrap: FlexWrap.Wrap,
      Gap: 8,
      Children: {
        GalleryTheme.GhostButton("Orientation: " + orientationName(), () -> cycleOrientation()),
        GalleryTheme.GhostButton("Rotate 90° · " + shownRotation.ToString() + "°", () -> rotateTiles()),
        GalleryTheme.GhostButton("Swap ends", () -> swapEnds()),
        GalleryTheme.GhostButton("Shuffle", () -> shuffleTiles()),
        GalleryTheme.GhostButton("Go workers", () -> runWorkers()),
      },
    }
    let spiral = Container{
      Height: Length.Percent(100),
      MaxWidth: Length.Percent(100),
      MinWidth: 0,
      MinHeight: 0,
      AspectRatio: if orientation % 2 == 0 { 34.0 / 21.0 } else { 21.0 / 34.0 },
      Position: PositionType.Relative,
      OverflowX: Overflow.Hidden,
      OverflowY: Overflow.Hidden,
      BackgroundColor: Color.Rgb(8, 8, 10),
      BorderWidth: 1,
      BorderColor: GalleryTheme.BorderStrong,
      BorderRadius: 8,
      Children: buildTiles(),
    }
    let grid = Container{
      Width: Length.Percent(100),
      MinWidth: 0,
      MinHeight: 0,
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      Children: { spiral },
    }
    return Container{
      Width: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 14,
      Children: { controls, grid },
    }
  }

  private func buildTiles() List[Blob] {
    let children = List[Blob](tiles.Count)
    let layoutWidth = if orientation % 2 == 0 { 34.0 } else { 21.0 }
    let layoutHeight = if orientation % 2 == 0 { 21.0 } else { 34.0 }
    var slot int32 = 0
    for tile in tiles {
      let placement = galleryFibonacciPlacement(slot, orientation)
      let fill = if tile.Value % 3 == 0 {
        Color.Rgb(225, 112, 80)
      } else {
        if tile.Value % 3 == 1 {
          Color.Rgb(74, 159, 168)
        } else {
          Color.Rgb(202, 164, 70)
        }
      }
      children.Add(Container{
        Key: "tile-" + tile.Index.ToString(),
        Position: PositionType.Absolute,
        Left: Length.Percent(placement.Left / layoutWidth * 100.0),
        Top: Length.Percent(placement.Top / layoutHeight * 100.0),
        Width: Length.Percent(placement.Size / layoutWidth * 100.0),
        Height: Length.Percent(placement.Size / layoutHeight * 100.0),
        MinWidth: 0,
        MinHeight: 0,
        BorderWidth: 1,
        BorderColor: Color.Rgba(8, 8, 10, 180),
        BackgroundColor: fill,
        Transform: PanelTransform{ Rotate: rotation },
        TransitionMs: 350.0,
        TransitionEasing: Easing.EaseInOut,
        JustifyContent: JustifyContent.Center,
        AlignItems: AlignItems.Center,
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Hidden,
        Children: {
          Text{
            Content: tile.Value.ToString(),
            FontSize: if slot < 2 { 8 } else { if slot < 4 { 10 } else { 14 } },
            FontWeight: 700,
            Color: Color.Rgb(10, 10, 11),
          },
        },
      })
      slot = slot + 1
    }
    return children
  }

  private func posterContent() Blob {
    let narrowPoster = posterWidth < 760.0
    let paper = Color.Rgb(238, 233, 219)
    let ink = Color.Rgb(12, 13, 15)
    let blue = Color.Rgb(63, 86, 235)
    let acid = Color.Rgb(211, 239, 80)
    let coral = Color.Rgb(244, 92, 70)
    let formOffset = posterFormReflow.Offset
    let alignOffset = posterAlignReflow.Offset
    let flowOffset = posterFlowReflow.Offset
    let gapOffset = posterGapReflow.Offset
    let wrapOffset = posterWrapReflow.Offset
    return Container{
      Width: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 14,
      Children: {
        Cell.Mount[GalleryRange]("poster-width", func(slider GalleryRange) {
          slider.Label = "Poster width"
          slider.MinValue = 380.0
          slider.MaxValue = 1120.0
          slider.Value = posterWidth
          slider.Step = 10.0
          slider.OnChange = (value float64) -> {
            posterWidth = value
            Rebuild()
          }
        }),
        Container{
          Key: "poster-stage",
          Width: Length.Percent(100),
          MinWidth: 0,
          MinHeight: 0,
          FlexGrow: 1.0,
          FlexShrink: 1.0,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.Center,
          Children: {
            Container{
              Key: "poster",
              Width: posterWidth,
              MaxWidth: Length.Percent(100),
              MinWidth: 0,
              Height: if narrowPoster { 600 } else { 540 },
              TransitionMs: 180.0,
              TransitionEasing: Easing.EaseInOut,
              TransitionProperties: GalleryPosterTransitions.Frame,
              Position: PositionType.Relative,
              FlexDirection: FlexDirection.Column,
              BackgroundColor: ink,
              BorderWidth: 1,
              BorderColor: Color.Rgb(88, 88, 94),
              OverflowX: Overflow.Hidden,
              OverflowY: Overflow.Hidden,
              Children: {
                Container{
                  Key: "poster-head",
                  Width: Length.Percent(100),
                  Height: 52,
                  MinHeight: 52,
                  PaddingLeft: 18,
                  PaddingRight: 18,
                  FlexDirection: FlexDirection.Row,
                  AlignItems: AlignItems.Center,
                  JustifyContent: JustifyContent.SpaceBetween,
                  BackgroundColor: paper,
                  BorderBottomWidth: 2,
                  BorderColor: ink,
                  Children: {
                    Text{
                      Content: "MODULAR / SYSTEM 03",
                      FontSize: 11,
                      FontWeight: 750,
                      LetterSpacing: 1.2,
                      Color: ink,
                    },
                    Text{
                      Content: int32(posterWidth).ToString() + " PX",
                      FontSize: 11,
                      FontWeight: 750,
                      LetterSpacing: 1.2,
                      Color: ink,
                    },
                  },
                },
                Container{
                  Key: "poster-grid",
                  Width: Length.Percent(100),
                  MinWidth: 0,
                  MinHeight: 0,
                  FlexGrow: 1.0,
                  FlexShrink: 1.0,
                  Padding: 10,
                  FlexDirection: FlexDirection.Row,
                  FlexWrap: FlexWrap.Wrap,
                  Gap: 10,
                  RowGap: 10,
                  ColumnGap: 10,
                  AlignItems: AlignItems.Stretch,
                  AlignContent: AlignContent.SpaceBetween,
                  BackgroundColor: ink,
                  Children: {
                    Container{
                      Key: "poster-form",
                      Handle: posterFormReflow.Handle,
                      Transform: PanelTransform{
                        TranslateX: formOffset.X,
                        TranslateY: formOffset.Y,
                      },
                      Height: if narrowPoster { 220 } else { 268 },
                      FlexGrow: 3.0,
                      FlexShrink: 1.0,
                      FlexBasis: if narrowPoster { 320 } else { 500 },
                      TransitionMs: 180.0,
                      TransitionEasing: Easing.EaseInOut,
                      TransitionProperties: GalleryPosterTransitions.Module,
                      MinWidth: 180,
                      Padding: 18,
                      FlexDirection: FlexDirection.Column,
                      JustifyContent: JustifyContent.SpaceBetween,
                      BackgroundColor: blue,
                      Children: {
                        Text{
                          Content: "FLEX-GROW 3 / BASIS 500",
                          FontSize: 10,
                          FontWeight: 700,
                          LetterSpacing: 1.0,
                          Color: paper,
                        },
                        Text{
                          Content: "FORM",
                          FontSize: if narrowPoster { 58 } else { 88 },
                          TransitionMs: 180.0,
                          TransitionEasing: Easing.EaseInOut,
                          TransitionProperties: GalleryPosterTransitions.Type,
                          FontWeight: 850,
                          LetterSpacing: -3.5,
                          LineHeight: 0.85,
                          Color: paper,
                        },
                      },
                    },
                    Container{
                      Key: "poster-align",
                      Handle: posterAlignReflow.Handle,
                      Transform: PanelTransform{
                        TranslateX: alignOffset.X,
                        TranslateY: alignOffset.Y,
                      },
                      Height: if narrowPoster { 150 } else { 268 },
                      FlexGrow: 1.0,
                      FlexShrink: 1.0,
                      FlexBasis: if narrowPoster { 140 } else { 220 },
                      TransitionMs: 180.0,
                      TransitionEasing: Easing.EaseInOut,
                      TransitionProperties: GalleryPosterTransitions.Module,
                      MinWidth: 84,
                      Padding: 16,
                      FlexDirection: FlexDirection.Column,
                      AlignItems: AlignItems.FlexEnd,
                      JustifyContent: JustifyContent.SpaceBetween,
                      BackgroundColor: acid,
                      Children: {
                        Text{
                          Content: "ALIGN / END",
                          FontSize: 10,
                          FontWeight: 750,
                          LetterSpacing: 0.8,
                          Color: ink,
                        },
                        Container{
                          Width: if narrowPoster { 50 } else { 72 },
                          Height: if narrowPoster { 50 } else { 72 },
                          BorderRadius: if narrowPoster { 25 } else { 36 },
                          TransitionMs: 180.0,
                          TransitionEasing: Easing.EaseInOut,
                          TransitionProperties: GalleryPosterTransitions.Marker,
                          BackgroundColor: ink,
                          AlignItems: AlignItems.Center,
                          JustifyContent: JustifyContent.Center,
                          Children: {
                            Text{
                              Content: "03",
                              FontSize: if narrowPoster { 14 } else { 22 },
                              TransitionMs: 180.0,
                              TransitionEasing: Easing.EaseInOut,
                              TransitionProperties: GalleryPosterTransitions.Type,
                              FontWeight: 800,
                              Color: acid,
                            },
                          },
                        },
                      },
                    },
                    Container{
                      Key: "poster-flow",
                      Handle: posterFlowReflow.Handle,
                      Transform: PanelTransform{
                        TranslateX: flowOffset.X,
                        TranslateY: flowOffset.Y,
                      },
                      Height: if narrowPoster { 130 } else { 180 },
                      FlexGrow: 2.0,
                      FlexShrink: 1.0,
                      FlexBasis: if narrowPoster { 220 } else { 360 },
                      TransitionMs: 180.0,
                      TransitionEasing: Easing.EaseInOut,
                      TransitionProperties: GalleryPosterTransitions.Module,
                      MinWidth: 150,
                      PaddingLeft: 18,
                      PaddingRight: 18,
                      FlexDirection: FlexDirection.Row,
                      AlignItems: AlignItems.Center,
                      JustifyContent: JustifyContent.SpaceBetween,
                      BackgroundColor: coral,
                      Children: {
                        Text{
                          Content: "FLOW",
                          FontSize: if narrowPoster { 40 } else { 62 },
                          TransitionMs: 180.0,
                          TransitionEasing: Easing.EaseInOut,
                          TransitionProperties: GalleryPosterTransitions.Type,
                          FontWeight: 850,
                          LetterSpacing: -2.4,
                          Color: ink,
                        },
                        Container{
                          FlexDirection: FlexDirection.Column,
                          AlignItems: AlignItems.FlexEnd,
                          Gap: 2,
                          Children: {
                            Text{
                              Content: "WRAP",
                              FontSize: 10,
                              FontWeight: 800,
                              LetterSpacing: 0.8,
                              Color: ink,
                            },
                            Text{
                              Content: "SHRINK 1",
                              FontSize: 10,
                              FontWeight: 800,
                              LetterSpacing: 0.8,
                              Color: ink,
                            },
                          },
                        },
                      },
                    },
                    Container{
                      Key: "poster-gap",
                      Handle: posterGapReflow.Handle,
                      Transform: PanelTransform{
                        TranslateX: gapOffset.X,
                        TranslateY: gapOffset.Y,
                      },
                      Height: if narrowPoster { 120 } else { 180 },
                      FlexGrow: 1.0,
                      FlexShrink: 1.0,
                      FlexBasis: if narrowPoster { 100 } else { 160 },
                      TransitionMs: 180.0,
                      TransitionEasing: Easing.EaseInOut,
                      TransitionProperties: GalleryPosterTransitions.Module,
                      MinWidth: 76,
                      Padding: 16,
                      FlexDirection: FlexDirection.Column,
                      JustifyContent: JustifyContent.SpaceBetween,
                      BackgroundColor: paper,
                      Children: {
                        Text{
                          Content: "GAP",
                          FontSize: 10,
                          FontWeight: 800,
                          LetterSpacing: 0.9,
                          Color: ink,
                        },
                        Text{
                          Content: "08",
                          FontSize: if narrowPoster { 34 } else { 52 },
                          TransitionMs: 180.0,
                          TransitionEasing: Easing.EaseInOut,
                          TransitionProperties: GalleryPosterTransitions.Type,
                          FontWeight: 850,
                          LetterSpacing: -1.5,
                          Color: ink,
                        },
                      },
                    },
                    Container{
                      Key: "poster-wrap",
                      Handle: posterWrapReflow.Handle,
                      Transform: PanelTransform{
                        TranslateX: wrapOffset.X,
                        TranslateY: wrapOffset.Y,
                      },
                      Height: if narrowPoster { 120 } else { 180 },
                      FlexGrow: 1.0,
                      FlexShrink: 2.0,
                      FlexBasis: if narrowPoster { 100 } else { 150 },
                      TransitionMs: 180.0,
                      TransitionEasing: Easing.EaseInOut,
                      TransitionProperties: GalleryPosterTransitions.Module,
                      MinWidth: 72,
                      Padding: 16,
                      FlexDirection: FlexDirection.Column,
                      JustifyContent: JustifyContent.SpaceBetween,
                      BackgroundColor: Color.Rgb(31, 32, 37),
                      Children: {
                        Text{
                          Content: "COL",
                          FontSize: 10,
                          FontWeight: 800,
                          LetterSpacing: 0.9,
                          Color: GalleryTheme.InkMuted,
                        },
                        Text{
                          Content: "12",
                          FontSize: if narrowPoster { 34 } else { 52 },
                          TransitionMs: 180.0,
                          TransitionEasing: Easing.EaseInOut,
                          TransitionProperties: GalleryPosterTransitions.Type,
                          FontWeight: 850,
                          LetterSpacing: -1.5,
                          Color: paper,
                        },
                      },
                    },
                  },
                },
                Container{
                  Key: "poster-badge",
                  Position: PositionType.Absolute,
                  Right: 16,
                  Bottom: 16,
                  ZIndex: 3,
                  PaddingLeft: 10,
                  PaddingRight: 10,
                  PaddingTop: 6,
                  PaddingBottom: 6,
                  BackgroundColor: acid,
                  BorderWidth: 1,
                  BorderColor: ink,
                  Children: {
                    Text{
                      Content: "ABS / PINNED",
                      FontSize: 9,
                      FontWeight: 850,
                      LetterSpacing: 0.9,
                      Color: ink,
                    },
                  },
                },
              },
            },
          },
        },
      },
    }
  }

  protected override func Build(input ComposeChapterInput) Blob -> if input.Showcase == 0 {
    GallerySpecimen(
      "Keyed Fibonacci tiles",
      "Reorient, rotate, shuffle, swap, or race workers while keyed identity survives.",
      tileContent())
  } else {
    GallerySpecimen(
      "Live modular poster",
      "Drag the width and watch basis, grow, shrink, wrapping, gaps, alignment, and the pinned badge negotiate space.",
      posterContent())
  }
}
