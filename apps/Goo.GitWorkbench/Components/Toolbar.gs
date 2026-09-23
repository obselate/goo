package GooGitWorkbench

import Goo
import System.IO

class WorkbenchToolbar {
    private let directory string
    private let branch string
    private let directoryInput string
    private let onInput Action[string]
    private let onOpen Action
    private let onRefresh Action

    init(
        directory string,
        branch string,
        directoryInput string,
        onInput Action[string],
        onOpen Action,
        onRefresh Action
    ) {
        this.directory = directory
        this.branch = branch
        this.directoryInput = directoryInput
        this.onInput = onInput
        this.onOpen = onOpen
        this.onRefresh = onRefresh
    }

    func render() Blob -> Container{
        Width: Length.Percent(100),
        Height: 82,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Stretch,
        Gap: 1,
        BackgroundColor: GitTheme.Border,
        Container{
            Width: 0,
            FlexGrow: 2,
            MinWidth: 280,
            Padding: 12,
            FlexDirection: FlexDirection.Column,
            JustifyContent: JustifyContent.Center,
            Gap: 6,
            BackgroundColor: GitTheme.Surface,
            Container{
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 8,
                Text{Content: "Repository", FontSize: 13, FontWeight: 600, Color: GitTheme.Text},
                Text{
                    Content: if directory == "" {
                        "No repository open"
                    } else {
                        DirectoryInfo(directory).Name
                    },
                    Width: 0,
                    FlexGrow: 1,
                    MinWidth: 0,
                    FontSize: 13,
                    Color: GitTheme.Muted,
                    TextWrap: TextWrap.NoWrap
                },
            },
            Container{
                Width: Length.Percent(100),
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 8,
                appInput(directoryInput, "Repository path", onInput),
                appButton("Open", onOpen),
            },
        },
        Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 160,
            Padding: 12,
            FlexDirection: FlexDirection.Column,
            JustifyContent: JustifyContent.Center,
            Gap: 5,
            BackgroundColor: GitTheme.Surface,
            Text{Content: "Branch", FontSize: 13, FontWeight: 600, Color: GitTheme.Text},
            Text{
                Content: if branch == "" {
                    "No branch"
                } else {
                    branch
                },
                Width: Length.Percent(100),
                FontSize: 13,
                Color: GitTheme.Muted,
                TextWrap: TextWrap.NoWrap
            },
        },
        Container{
            Width: 132,
            Padding: 12,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            JustifyContent: JustifyContent.Center,
            BackgroundColor: GitTheme.Surface,
            appButton("Refresh", onRefresh),
        },
    }
}
