Option Strict On
Option Explicit On
Option Infer On

Imports System
Imports System.Collections.Generic
Imports System.Linq
Imports System.Threading.Tasks
Imports Goo
Imports Goo.Widgets.Data
Imports Goo.Widgets.Layout

Module Program
    Sub Main(args As String())
        Dim sample = If(args.FirstOrDefault(), "counter")
        Dim window = New Window With {
            .Title = $"Visual Basic: {sample}",
            .Size = New LayoutSize(640, 480),
            .Root = New Examples(sample)
        }
        Goo.Widgets.Theme.Attach(window, Goo.Widgets.Theme.Default)
        Goo.Widgets.Theme.SetMode(window, Goo.Widgets.ThemeMode.Dark)
        Dim focused As Action(Of Boolean) = Sub(value) Console.WriteLine($"Focused: {value}")
        AddHandler window.FocusChanged, focused
        RemoveHandler window.FocusChanged, focused
        If args.Contains("--check") Then
            Dim counter = New Counter()
            DirectCast(DirectCast(counter.Build(), Container).Children(1), Button).OnClick.Invoke()
            If DirectCast(DirectCast(counter.Build(), Container).Children(0), Text).Content <> "Count: 1" Then
                Throw New InvalidOperationException("Counter failed.")
            End If
            If Examples.ListView({"Ada", "Grace"}).Children.Count <> 4 Then
                Throw New InvalidOperationException("List composition failed.")
            End If
            If Microsoft.VisualBasic.Strings.StrReverse("ydaeR") <> "Ready" Then
                Throw New InvalidOperationException("Visual Basic runtime failed.")
            End If
            Console.WriteLine("VB interop checks passed.")
        Else
            Application.Run(window)
        End If
    End Sub
End Module

Public NotInheritable Class SampleTheme
    Public Const Spacing As Integer = 12
    Public Const SmallSpacing As Integer = 8
    Public Const DialogPadding As Integer = 20
    Public Const RowHeight As Integer = 28
    Public Shared ReadOnly Background As Color = Color.Rgb(24, 31, 43)
    Public Shared ReadOnly Foreground As Color = Color.Rgb(236, 240, 248)
    Public Shared ReadOnly Accent As Color = Color.Rgb(74, 125, 255)
    Public Shared ReadOnly ButtonStyle As New Style With {
        .Padding = 12, .BorderRadius = 8, .BackgroundColor = Accent
    }
    Public Shared ReadOnly PageStyle As New Style With {
        .Width = Length.Percent(100), .Height = Length.Percent(100),
        .Padding = 24, .Gap = 12, .FontSize = 18,
        .BackgroundColor = Background, .Color = Foreground
    }
    Public Shared ReadOnly ScrollbarStyle As New Scrollbar With {
        .Thickness = 8, .ReserveSpace = True,
        .Thumb = New Container With {.BackgroundColor = Accent, .BorderRadius = 4}
    }
End Class

Public NotInheritable Class Counter
    Inherits Cell

    Private ReadOnly count As New State(Of Integer)(0)
    Private ReadOnly buttonHandle As New ElementHandle()
    Private ReadOnly bindings As KeyBinding() = {
        New KeyBinding With {.Key = Key.Enter, .OnPress = Sub() buttonHandle.Activate()},
        New KeyBinding With {
            .Key = Key.Space,
            .OnPress = Sub() buttonHandle.BeginPress(),
            .OnRelease = Sub() buttonHandle.EndPress(True)
        }
    }

    Public Overrides Function Build() As Blob
        Return New Container With {
            .Gap = SampleTheme.Spacing,
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"Count: {count.Value}"},
                New Button With {
                    .BasedOn = SampleTheme.ButtonStyle,
                    .Handle = buttonHandle, .KeyBindings = bindings,
                    .OnClick = AddressOf Increment,
                    .Children = New List(Of Blob) From {New Text With {.Content = "Add one"}}
                }
            }
        }
    End Function

    Protected Overrides Sub Mounted()
        buttonHandle.Focus()
    End Sub

    Private Sub Increment()
        count.Value += 1
    End Sub
End Class

Public NotInheritable Class AccountInput
    Public ReadOnly Property Name As String

    Public Sub New(name As String)
        Me.Name = name
    End Sub
End Class

Public NotInheritable Class AccountCell
    Inherits Cell(Of AccountInput)

    Private ReadOnly edits As New State(Of Integer)(0)

    Protected Overrides Function Build(input As AccountInput) As Blob
        Return New Button With {
            .BasedOn = SampleTheme.ButtonStyle, .OnClick = AddressOf Edit,
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"{input.Name}: {edits.Value}"}
            }
        }
    End Function

    Private Sub Edit()
        edits.Value += 1
    End Sub
End Class

Public NotInheritable Class AsyncStatus
    Inherits Cell

    Private ReadOnly status As New State(Of String)("Idle")

    Public Overrides Function Build() As Blob
        Return New Container With {
            .Gap = SampleTheme.Spacing,
            .Children = New List(Of Blob) From {
                New Text With {.Content = status.Value},
                New Button With {
                    .BasedOn = SampleTheme.ButtonStyle, .OnClick = AddressOf Refresh,
                    .Children = New List(Of Blob) From {New Text With {.Content = "Refresh"}}
                }
            }
        }
    End Function

    Private Async Sub Refresh()
        Dim token = Latest("refresh")
        status.Value = "Loading"
        Try
            Await Task.Delay(500, token).ConfigureAwait(False)
            Post(Sub()
                     If token.IsCancellationRequested Then Return
                     status.Value = Microsoft.VisualBasic.Strings.StrReverse("ydaeR")
                 End Sub)
        Catch ex As OperationCanceledException When token.IsCancellationRequested
        End Try
    End Sub
End Class

Public NotInheritable Class Examples
    Inherits Cell

    Private ReadOnly sample As String
    Private ReadOnly isOpen As New State(Of Boolean)(False)
    Private ReadOnly items As String()
    Private Shared ReadOnly account As New AccountInput("Ada")
    Private Shared ReadOnly itemKey As Func(Of String, String) = Function(value) value
    Private Shared ReadOnly buildRow As Func(Of String, Blob) =
        Function(value) New Text With {.Content = value, .Height = SampleTheme.RowHeight}

    Public Sub New(sample As String)
        Me.sample = sample
        items = If(sample = "virtual",
            Enumerable.Range(0, 10000).Select(Function(i) $"Item {i:D5}").ToArray(),
            Array.Empty(Of String)())
    End Sub

    Public Shared Function ListView(data As IEnumerable(Of String)) As Container
        Dim rows = data.Select(Function(value) DirectCast(New Text With {.Key = value, .Content = value}, Blob))
        Dim children = New List(Of Blob) From {New Text With {.Content = "Account"}}
        children.AddRange(rows)
        children.Add(New Button With {
            .BasedOn = SampleTheme.ButtonStyle, .OnClick = Sub() Console.WriteLine("Save"),
            .Children = New List(Of Blob) From {New Text With {.Content = "Save"}}
        })
        Return New Container With {
            .Width = Length.Pixels(320), .MaxWidth = Length.Percent(100),
            .Padding = SampleTheme.Spacing, .Gap = SampleTheme.SmallSpacing, .Children = children
        }
    End Function

    Public Overrides Function Build() As Blob
        Return New Container With {
            .BasedOn = SampleTheme.PageStyle,
            .Children = New List(Of Blob) From {
                New Text With {.Content = $"Visual Basic / {sample}"},
                BuildScene()
            }
        }
    End Function

    Private Function BuildScene() As Blob
        Select Case sample
            Case "list"
                Return ListView({"Ada", "Grace", "Linus"})
            Case "input"
                Return Cell.Mount(Of AccountInput, AccountCell)("account", account)
            Case "virtual"
                Dim rows = VirtualLists.Rows(items, SampleTheme.RowHeight, itemKey, buildRow)
                rows.FlexGrow = 1
                rows.MinHeight = 0
                rows.ScrollbarY = SampleTheme.ScrollbarStyle
                rows.ScrollbarVisibilityY = ScrollbarVisibility.Always
                Return rows
            Case "variants"
                Return New Container With {
                    .Gap = SampleTheme.Spacing,
                    .Children = New List(Of Blob) From {
                        New Button With {
                            .BasedOn = SampleTheme.ButtonStyle,
                            .Children = New List(Of Blob) From {New Text With {.Content = "Base"}}
                        },
                        New Button With {
                            .BasedOn = SampleTheme.ButtonStyle,
                            .BackgroundColor = SampleTheme.Background,
                            .Children = New List(Of Blob) From {New Text With {.Content = "Override"}}
                        }
                    }
                }
            Case "layout"
                Return New Container With {
                    .FlexDirection = FlexDirection.Row, .Gap = SampleTheme.Spacing,
                    .Children = New List(Of Blob) From {
                        New Text With {.Content = "One", .FlexGrow = 1, .MinWidth = 0},
                        New Text With {.Content = "Two", .FlexGrow = 1, .MinWidth = 0}
                    }
                }
            Case "dialog"
                Dim dialog = New ModalDialog With {
                    .Open = isOpen.Value, .Content = New Text With {.Content = "Save account?"},
                    .Padding = SampleTheme.DialogPadding,
                    .OnOpenChange = Sub(value) isOpen.Value = value,
                    .OnCancel = AddressOf CloseDialog, .OnConfirm = AddressOf CloseDialog
                }
                Return New Container With {
                    .FlexGrow = 1,
                    .Children = New List(Of Blob) From {
                        New Button With {
                            .BasedOn = SampleTheme.ButtonStyle, .OnClick = AddressOf OpenDialog,
                            .Children = New List(Of Blob) From {New Text With {.Content = "Open dialog"}}
                        },
                        Cell.Mount(Of ModalDialog, ModalDialogHost)("dialog", dialog)
                    }
                }
            Case "async"
                Return Cell.Mount(Of AsyncStatus)("status")
            Case Else
                Return Cell.Mount(Of Counter)("counter")
        End Select
    End Function

    Private Sub OpenDialog()
        isOpen.Value = True
    End Sub

    Private Sub CloseDialog()
        isOpen.Value = False
    End Sub

    Public Shared Function HitTest(handle As ElementHandle, point As Point) As TextPosition?
        Dim position As TextPosition
        If handle.TryGetTextPositionAt(point, TextCoordinateSpace.Window, position) Then Return position
        Return Nothing
    End Function

    Public Shared Async Function PickFile(window As Window) As Task(Of FileDialogResult)
        Return Await window.ShowFileDialogAsync(FileDialogKind.OpenFile)
    End Function
End Class
