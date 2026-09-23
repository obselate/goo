package GooGitWorkbench

import Goo
import System.Collections.Generic
import System.IO

class WorkbenchToolbar {
    private let directory string
    private let branch string
    private let branches List[string]
    private let directoryInput string
    private let repositoryOpen bool
    private let branchOpen bool
    private let repositoryHandle ElementHandle
    private let branchHandle ElementHandle
    private let onInput Action[string]
    private let onOpen Action
    private let onRefresh Action
    private let onToggleRepository Action
    private let onToggleBranch Action
    private let onSelectBranch Action[string]

    init(
        directory string,
        branch string,
        branches List[string],
        directoryInput string,
        repositoryOpen bool,
        branchOpen bool,
        repositoryHandle ElementHandle,
        branchHandle ElementHandle,
        onInput Action[string],
        onOpen Action,
        onRefresh Action,
        onToggleRepository Action,
        onToggleBranch Action,
        onSelectBranch Action[string]
    ) {
        this.directory = directory
        this.branch = branch
        this.branches = branches
        this.directoryInput = directoryInput
        this.repositoryOpen = repositoryOpen
        this.branchOpen = branchOpen
        this.repositoryHandle = repositoryHandle
        this.branchHandle = branchHandle
        this.onInput = onInput
        this.onOpen = onOpen
        this.onRefresh = onRefresh
        this.onToggleRepository = onToggleRepository
        this.onToggleBranch = onToggleBranch
        this.onSelectBranch = onSelectBranch
    }

    private func repositoryName() string -> if directory == "" {
        "No repository open"
    } else if DirectoryInfo(directory).Name == "" {
        directory
    } else {
        DirectoryInfo(directory).Name
    }

    private func repositoryControl() Blob -> Button{
        Handle: repositoryHandle,
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Padding: 12,
        FlexDirection: FlexDirection.Column,
        AlignItems: AlignItems.Stretch,
        JustifyContent: JustifyContent.Center,
        Gap: 5,
        BackgroundColor: GitTheme.Surface,
        BorderWidth: 0,
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
        OnClick: onToggleRepository,
        Text{Content: "Current Repository", FontSize: 13, FontWeight: 600, Color: GitTheme.Text},
        Container{
            Width: Length.Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 8,
            Text{
                Content: repositoryName(),
                Width: 0,
                FlexGrow: 1,
                MinWidth: 0,
                FontSize: 15,
                FontWeight: 600,
                Color: GitTheme.Muted,
                TextWrap: TextWrap.NoWrap
            },
            Text{Content: "▼", FontSize: 11, Color: GitTheme.Muted},
        },
    }

    private func branchControl() Blob -> Button{
        Handle: branchHandle,
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Padding: 12,
        FlexDirection: FlexDirection.Column,
        AlignItems: AlignItems.Stretch,
        JustifyContent: JustifyContent.Center,
        Gap: 5,
        BackgroundColor: GitTheme.Surface,
        BorderWidth: 0,
        Disabled: directory == "",
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
        OnClick: onToggleBranch,
        Text{Content: "Current Branch", FontSize: 13, FontWeight: 600, Color: GitTheme.Text},
        Container{
            Width: Length.Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 8,
            Text{
                Content: if branch == "" {
                    "Detached HEAD"
                } else {
                    branch
                },
                Width: 0,
                FlexGrow: 1,
                MinWidth: 0,
                FontSize: 16,
                FontWeight: 600,
                Color: GitTheme.Muted,
                TextWrap: TextWrap.NoWrap
            },
            Text{Content: "▼", FontSize: 11, Color: GitTheme.Muted},
        },
    }

    private func repositoryPopover() Blob -> Portal{
        Anchor: repositoryHandle,
        Placement: PortalPlacement.BottomStart,
        ZIndex: 20,
        Container{
            Width: 420,
            Padding: 12,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 8,
            BackgroundColor: GitTheme.Surface,
            BorderWidth: 1,
            BorderColor: GitTheme.Border,
            BorderRadius: 6,
            appInput(directoryInput, "Repository path", onInput),
            appButton("Open", onOpen),
        },
    }

    private func branchItem(name string) Blob -> Button{
        Width: Length.Percent(100),
        MinWidth: 0,
        Padding: 9,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        BackgroundColor: GitTheme.Surface,
        BorderWidth: 0,
        Hover: Style{BackgroundColor: GitTheme.Button},
        OnClick: () -> onSelectBranch(name),
        Text{
            Content: name,
            Width: Length.Percent(100),
            MinWidth: 0,
            FontSize: 13,
            Color: if name == branch {
                GitTheme.Accent
            } else {
                GitTheme.Text
            },
            TextWrap: TextWrap.Wrap
        },
    }

    private func branchPopover() Blob {
        let items = List[Blob]()
        for name in branches {
            items.Add(branchItem(name))
        }
        if items.Count == 0 {
            items.Add(Text{Content: "No local branches", Padding: 10, FontSize: 13, Color: GitTheme.Muted})
        }
        return Portal{
            Anchor: branchHandle,
            Placement: PortalPlacement.BottomStart,
            ZIndex: 20,
            Container{
                Width: 360,
                MaxHeight: 420,
                Padding: 5,
                FlexDirection: FlexDirection.Column,
                Gap: 2,
                Overflow: Overflow.Scroll,
                BackgroundColor: GitTheme.Surface,
                BorderWidth: 1,
                BorderColor: GitTheme.Border,
                BorderRadius: 6,
                Children: items,
            },
        }
    }

    private func refreshControl() Blob -> Button{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Padding: 12,
        FlexDirection: FlexDirection.Column,
        AlignItems: AlignItems.Stretch,
        JustifyContent: JustifyContent.Center,
        Gap: 5,
        BackgroundColor: GitTheme.Surface,
        BorderWidth: 0,
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
        OnClick: onRefresh,
        Text{Content: "Refresh", FontSize: 15, FontWeight: 600, Color: GitTheme.Text},
        Text{Content: "Reload files and history", FontSize: 13, Color: GitTheme.Muted},
    }

    func render() Blob {
        let children = List[Blob]()
        children.Add(
            Container{
                Width: Length.Percent(26),
                MinWidth: 240,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Surface,
                repositoryControl(),
            }
        )
        children.Add(
            Container{
                Width: Length.Percent(26),
                MinWidth: 240,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Surface,
                branchControl(),
            }
        )
        children.Add(
            Container{
                Width: Length.Percent(26),
                MinWidth: 220,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Surface,
                refreshControl(),
            }
        )
        children.Add(Container{Width: 0, FlexGrow: 1, Height: Length.Percent(100), BackgroundColor: GitTheme.Surface,})
        if repositoryOpen {
            children.Add(repositoryPopover())
        }
        if branchOpen {
            children.Add(branchPopover())
        }
        return Container{
            Width: Length.Percent(100),
            Height: 82,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Stretch,
            Gap: 1,
            BackgroundColor: GitTheme.Border,
            Children: children,
        }
    }
}
