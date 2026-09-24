package GooGitWorkbench

import Goo
import System.Collections.Generic
import System.IO

class WorkbenchToolbar {
    private let directory string
    private let branch string
    private let branches List[string]
    private let pull GitPullState
    private let busy bool
    private let branchOpen bool
    private let branchHandle ElementHandle
    private let onOpen Action
    private let onPull Action
    private let onToggleBranch Action
    private let onSelectBranch Action[string]
    private let keyboardFocus bool

    init(
        directory string,
        branch string,
        branches List[string],
        pull GitPullState,
        busy bool,
        branchOpen bool,
        branchHandle ElementHandle,
        onOpen Action,
        onPull Action,
        onToggleBranch Action,
        onSelectBranch Action[string],
        keyboardFocus bool
    ) {
        this.directory = directory
        this.branch = branch
        this.branches = branches
        this.pull = pull
        this.busy = busy
        this.branchOpen = branchOpen
        this.branchHandle = branchHandle
        this.onOpen = onOpen
        this.onPull = onPull
        this.onToggleBranch = onToggleBranch
        this.onSelectBranch = onSelectBranch
        this.keyboardFocus = keyboardFocus
    }

    private func repositoryName() string -> if directory == "" {
        "No repository open"
    } else if DirectoryInfo(directory).Name == "" {
        directory
    } else {
        DirectoryInfo(directory).Name
    }

    private func selector(
        icon string,
        label string,
        value string,
        action Action,
        enabled bool,
        name string,
        handle ElementHandle? = nil
    ) Button -> Button{
        Handle: handle,
        Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: name},
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        PaddingLeft: 14,
        PaddingRight: 14,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 12,
        BackgroundColor: GitTheme.Toolbar,
        BorderWidth: 0,
        Disabled: !enabled,
        Hover: Style{BackgroundColor: GitTheme.Border},
        Focus: GitTheme.FocusRing(keyboardFocus),
        OnClick: action,
        KeyBindings: WorkbenchButtonBindings(action),
        GitTheme.Icon(icon, 22),
        Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            FlexDirection: FlexDirection.Column,
            Gap: 3,
            Text{Content: label, FontSize: 12, Color: GitTheme.Muted, TextWrap: TextWrap.NoWrap},
            Text{
                Content: value,
                Width: Length.Percent(100),
                MinWidth: 0,
                FontSize: 15,
                FontWeight: 600,
                Color: GitTheme.Text,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            },
        },
        GitTheme.Icon("\uE5CF", 18),
    }

    private func repositoryControl() Blob -> selector(
        "\uE2C8",
        "Current Repository",
        repositoryName(),
        onOpen,
        !busy,
        "Open repository"
    )

    private func branchControl() Blob -> selector(
        "\uE97A",
        "Current Branch",
        if branch == "" {
            "Detached HEAD"
        } else {
            branch
        },
        onToggleBranch,
        !busy && directory != "",
        "Current Branch",
        branchHandle
    )

    private func branchItem(name string) Blob -> Button{
        Width: Length.Percent(100),
        MinWidth: 0,
        Padding: 9,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        BackgroundColor: if name == branch {
            GitTheme.Selection
        } else {
            GitTheme.Surface
        },
        BorderWidth: 0,
        Hover: Style{BackgroundColor: GitTheme.RowHover},
        OnClick: () -> onSelectBranch(name),
        KeyBindings: WorkbenchButtonBindings(() -> onSelectBranch(name)),
        Focus: GitTheme.FocusRing(keyboardFocus),
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

    private func pullControl() Blob -> Button{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        PaddingLeft: 14,
        PaddingRight: 14,
        Disabled: busy || !pull.Available,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 12,
        BackgroundColor: GitTheme.Toolbar,
        BorderWidth: 0,
        Hover: Style{BackgroundColor: GitTheme.Border},
        Focus: GitTheme.FocusRing(keyboardFocus),
        Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: "Pull origin"},
        OnClick: onPull,
        KeyBindings: WorkbenchButtonBindings(onPull),
        GitTheme.Icon("\uE5DB", 22),
        Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            FlexDirection: FlexDirection.Column,
            Gap: 3,
            Text{
                Content: if busy {
                    "Pulling origin…"
                } else {
                    "Pull origin"
                },
                FontSize: 15,
                FontWeight: 600,
                Color: if pull.Available {
                    GitTheme.Text
                } else {
                    GitTheme.Muted
                },
                TextWrap: TextWrap.NoWrap,
            },
            Text{
                Width: Length.Percent(100),
                Content: if busy {
                    "Contacting origin…"
                } else {
                    pull.Message
                },
                FontSize: 12,
                Color: GitTheme.Muted,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            },
        },
    }

    func render() Blob {
        let children = List[Blob]()
        children.Add(
            Container{
                Width: GitTheme.SidebarWidth,
                FlexShrink: 0,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Toolbar,
                repositoryControl(),
            }
        )
        children.Add(
            Container{
                Width: Length.Percent(26),
                MinWidth: 200,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Toolbar,
                branchControl(),
            }
        )
        children.Add(
            Container{
                Width: Length.Percent(26),
                MinWidth: 220,
                Height: Length.Percent(100),
                BackgroundColor: GitTheme.Toolbar,
                pullControl(),
            }
        )
        children.Add(Container{Width: 0, FlexGrow: 1, Height: Length.Percent(100), BackgroundColor: GitTheme.Toolbar,})
        if branchOpen {
            children.Add(branchPopover())
        }
        return Container{
            Width: Length.Percent(100),
            Height: GitTheme.ToolbarHeight,
            FlexShrink: 0,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Stretch,
            Gap: 1,
            BackgroundColor: GitTheme.BorderStrong,
            BorderBottomWidth: 1,
            BorderBottomColor: GitTheme.BorderStrong,
            Children: children,
        }
    }
}
