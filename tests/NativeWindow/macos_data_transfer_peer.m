#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreServices/CoreServices.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>

static BOOL source_mode;
static BOOL stopped;
static BOOL failed;
static NSDragOperation desired_effect;
static NSString *content_kind;
static NSString *directory_path;
static NSString *png_path;
static NSString *mime_types[] = {@"text/plain;charset=utf-8", @"image/png", @"application/x-goo-transfer-check", @"application/x-goo-empty"};

static void require(BOOL condition, NSString *message)
{
    if (!condition) @throw [NSException exceptionWithName:@"TransferCheck" reason:message userInfo:nil];
}

static void output(NSString *line)
{
    fprintf(stdout, "%s\n", line.UTF8String);
    fflush(stdout);
}

static NSString *raw_type(NSString *mime)
{
    NSData *bytes = [mime dataUsingEncoding:NSASCIIStringEncoding];
    const unsigned char *data = bytes.bytes;
    char text[513];
    const char hex[] = "0123456789ABCDEF";
    for (NSUInteger i = 0; i < bytes.length; ++i) {
        text[i * 2] = hex[data[i] >> 4];
        text[i * 2 + 1] = hex[data[i] & 15];
    }
    text[bytes.length * 2] = 0;
    return [@"io.github.obselate.goo.mime." stringByAppendingString:[NSString stringWithUTF8String:text]];
}

static NSString *native_type(NSUInteger index)
{
    if (index == 0) return NSPasteboardTypeString;
    if (index == 1) return NSPasteboardTypePNG;
    return CFBridgingRelease(UTTypeCreatePreferredIdentifierForTag(kUTTagClassMIMEType, (__bridge CFStringRef)mime_types[index], NULL));
}

static NSData *expected_bytes(NSUInteger index)
{
    if (index == 0) return [@"native MIME transfer" dataUsingEncoding:NSUTF8StringEncoding];
    if (index == 1) return [NSData dataWithContentsOfFile:png_path];
    if (index == 3) return [NSData data];
    NSMutableData *bytes = [NSMutableData dataWithLength:1048576];
    unsigned char *data = bytes.mutableBytes;
    for (NSUInteger i = 0; i < bytes.length; ++i) data[i] = (unsigned char)i;
    return bytes;
}

static NSArray<id<NSPasteboardWriting>> *make_data(void)
{
    if (![content_kind isEqualToString:@"mime"]) {
        NSMutableArray<NSURL *> *urls = [NSMutableArray arrayWithCapacity:2];
        for (int i = 0; i < 2; ++i) [urls addObject:[NSURL fileURLWithPath:[directory_path stringByAppendingPathComponent:[NSString stringWithFormat:@"source-%d.txt", i]]]];
        if ([content_kind isEqualToString:@"legacy"]) {
            NSPasteboardItem *item = [NSPasteboardItem new];
            require([item setPropertyList:[urls valueForKey:@"path"] forType:NSFilenamesPboardType], @"Cannot publish native file names");
            return @[item];
        }
        return urls;
    }
    NSPasteboardItem *item = [NSPasteboardItem new];
    for (NSUInteger i = 0; i < 4; ++i) require([item setData:expected_bytes(i) forType:native_type(i)], @"Cannot publish native MIME bytes");
    return @[item];
}

static void check_data(NSPasteboard *board)
{
    if (![content_kind isEqualToString:@"mime"]) {
        NSArray<NSURL *> *urls = [board readObjectsForClasses:@[[NSURL class]] options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}];
        require(urls.count == 2, @"Native file count changed");
        for (NSUInteger i = 0; i < urls.count; ++i) {
            NSString *from = [directory_path stringByAppendingPathComponent:[NSString stringWithFormat:@"source-%lu.txt", (unsigned long)i]];
            NSString *to = [directory_path stringByAppendingPathComponent:[NSString stringWithFormat:@"destination-%lu.txt", (unsigned long)i]];
            require([urls[i].path isEqualToString:from], @"Native file path changed");
            NSString *text = [NSString stringWithContentsOfFile:from encoding:NSUTF8StringEncoding error:NULL];
            require([text isEqualToString:[NSString stringWithFormat:@"native file %lu", (unsigned long)i]], @"Native file contents changed");
            NSError *error = nil;
            BOOL result = desired_effect == NSDragOperationMove
                ? [[NSFileManager defaultManager] moveItemAtPath:from toPath:to error:&error]
                : [[NSFileManager defaultManager] copyItemAtPath:from toPath:to error:&error];
            require(result, error.localizedDescription ?: @"Native file operation failed");
        }
        return;
    }
    for (NSUInteger i = 0; i < 4; ++i) {
        NSData *data = [board dataForType:raw_type(mime_types[i])];
        if (!data) data = [board dataForType:native_type(i)];
        require(data != nil, @"Native MIME representation is missing");
        if (i == 2) {
            require(data.length == 1048576, @"Native binary byte count changed");
            const unsigned char *bytes = data.bytes;
            for (NSUInteger j = 0; j < data.length; ++j) require(bytes[j] == (unsigned char)j, @"Native binary bytes changed");
        } else require([data isEqualToData:expected_bytes(i)], @"Native MIME bytes changed");
    }
}

@interface PeerView : NSView<NSDraggingSource, NSDraggingDestination>
@end

@implementation PeerView
- (void)drawRect:(NSRect)rect
{
    [[NSColor colorWithRed:0.2 green:0.35 blue:0.45 alpha:1] setFill];
    NSRectFill(rect);
}
- (void)mouseDown:(NSEvent *)event
{
    if (!source_mode) return;
    @try {
        NSArray *writers = make_data();
        NSMutableArray<NSDraggingItem *> *items = [NSMutableArray arrayWithCapacity:writers.count];
        NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
        for (id<NSPasteboardWriting> writer in writers) {
            NSDraggingItem *item = [[NSDraggingItem alloc] initWithPasteboardWriter:writer];
            [item setDraggingFrame:NSMakeRect(point.x, point.y, 24, 24) contents:[NSImage imageNamed:NSImageNameMultipleDocuments]];
            [items addObject:item];
        }
        output(@"start 0");
        NSDraggingSession *session = [self beginDraggingSessionWithItems:items event:event source:self];
        require(session != nil, @"AppKit did not begin the native source drag");
        session.animatesToStartingPositionsOnCancelOrFail = NO;
    } @catch (NSException *error) {
        fprintf(stderr, "%s\n", error.reason.UTF8String);
        failed = YES;
        stopped = YES;
    }
}
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context
{
    (void)session;
    (void)context;
    return NSDragOperationCopy | NSDragOperationMove;
}
- (void)draggingSession:(NSDraggingSession *)session endedAtPoint:(NSPoint)point operation:(NSDragOperation)operation
{
    (void)session;
    (void)point;
    int effect = operation & NSDragOperationMove ? 2 : operation & NSDragOperationCopy ? 1 : 0;
    output([NSString stringWithFormat:@"source-end %d %d %d", effect ? 0 : 1, effect, effect == 2 && [content_kind isEqualToString:@"mime"]]);
    stopped = YES;
}
- (NSDragOperation)draggingEntered:(id<NSDraggingInfo>)sender
{
    return sender.draggingSourceOperationMask & desired_effect;
}
- (NSDragOperation)draggingUpdated:(id<NSDraggingInfo>)sender
{
    return sender.draggingSourceOperationMask & desired_effect;
}
- (BOOL)performDragOperation:(id<NSDraggingInfo>)sender
{
    @try {
        check_data(sender.draggingPasteboard);
        output([NSString stringWithFormat:@"drop-complete %d", desired_effect == NSDragOperationMove ? 2 : 1]);
        stopped = YES;
        return YES;
    } @catch (NSException *error) {
        fprintf(stderr, "%s\n", error.reason.UTF8String);
        failed = YES;
        stopped = YES;
        return NO;
    }
}
@end

static CGRect window_bounds(pid_t pid)
{
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
    CGRect found = CGRectNull;
    for (NSDictionary *window in windows) {
        if ([window[(__bridge NSString *)kCGWindowOwnerPID] intValue] != pid || [window[(__bridge NSString *)kCGWindowLayer] intValue] != 0) continue;
        CGRect bounds;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(__bridge NSString *)kCGWindowBounds], &bounds) || bounds.size.width < 400) continue;
        if (CGRectIsNull(found) || bounds.size.width * bounds.size.height > found.size.width * found.size.height) found = bounds;
    }
    return found;
}

static void mouse_event(CGEventType type, CGPoint point)
{
    CGEventRef event = CGEventCreateMouseEvent(NULL, type, point, kCGMouseButtonLeft);
    require(event != NULL, @"Cannot create native mouse event");
    CGEventSetIntegerValueField(event, kCGMouseEventClickState, 1);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

static void input_drag(pid_t from_pid, pid_t to_pid, unsigned int hold)
{
    require(CGPreflightPostEventAccess(), @"The macOS runner requires native input permission for the transfer fixture");
    [[NSRunningApplication runningApplicationWithProcessIdentifier:from_pid] activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    CGRect from = CGRectNull;
    CGRect to = CGRectNull;
    for (int attempt = 0; attempt < 100; ++attempt) {
        from = window_bounds(from_pid);
        to = window_bounds(to_pid);
        if (!CGRectIsNull(from) && !CGRectIsNull(to)) break;
        usleep(20000);
    }
    require(!CGRectIsNull(from), [NSString stringWithFormat:@"Source fixture window bounds are unavailable for %d", from_pid]);
    require(!CGRectIsNull(to), [NSString stringWithFormat:@"Target fixture window bounds are unavailable for %d", to_pid]);
    CGPoint start = CGPointMake(from.origin.x + 50, from.origin.y + 80);
    CGPoint end = CGPointMake(to.origin.x + 100, to.origin.y + 100);
    mouse_event(kCGEventMouseMoved, start);
    usleep(150000);
    mouse_event(kCGEventLeftMouseDown, start);
    @try {
        usleep(150000);
        mouse_event(kCGEventLeftMouseDragged, CGPointMake(start.x + 24, start.y + 12));
        usleep(150000);
        mouse_event(kCGEventLeftMouseDragged, end);
        usleep(hold * 1000);
        mouse_event(kCGEventLeftMouseUp, end);
    } @catch (NSException *error) {
        mouse_event(kCGEventLeftMouseUp, end);
        @throw error;
    }
    output(@"input-complete");
}

int main(int argc, const char **argv)
{
    @autoreleasepool {
        @try {
            require(argc >= 3, @"A peer mode and title are required");
            NSString *mode = @(argv[1]);
            if ([mode isEqualToString:@"input"]) {
                require(argc == 5, @"Input requires source PID, target PID and a hold time");
                input_drag(atoi(argv[2]), atoi(argv[3]), (unsigned int)strtoul(argv[4], NULL, 10));
                return 0;
            }
            if ([mode isEqualToString:@"close"]) {
                require([[NSRunningApplication runningApplicationWithProcessIdentifier:atoi(argv[2])] terminate], @"Cannot close the fixture app");
                return 0;
            }
            require(argc == 7, @"Peer requires title, effect, kind, directory and PNG");
            source_mode = [mode isEqualToString:@"source"];
            desired_effect = atoi(argv[3]) == 2 ? NSDragOperationMove : NSDragOperationCopy;
            content_kind = @(argv[4]);
            directory_path = @(argv[5]);
            png_path = @(argv[6]);
            [NSApplication sharedApplication];
            [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
            [NSApp finishLaunching];
            NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(40, 40, 480, 160)
                styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
            window.releasedWhenClosed = NO;
            window.title = @(argv[2]);
            PeerView *view = [[PeerView alloc] initWithFrame:NSMakeRect(0, 0, 480, 160)];
            if (!source_mode) {
                NSMutableArray<NSPasteboardType> *types = [NSMutableArray arrayWithObjects:NSPasteboardTypeFileURL, NSFilenamesPboardType, nil];
                for (NSUInteger i = 0; i < 4; ++i) {
                    [types addObject:raw_type(mime_types[i])];
                    [types addObject:native_type(i)];
                }
                [view registerForDraggedTypes:types];
            }
            window.contentView = view;
            [window makeKeyAndOrderFront:nil];
            [NSApp activateIgnoringOtherApps:YES];
            output(@"ready");
            while (!stopped) {
                @autoreleasepool {
                    NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate dateWithTimeIntervalSinceNow:0.01] inMode:NSDefaultRunLoopMode dequeue:YES];
                    if (event) [NSApp sendEvent:event];
                    [NSApp updateWindows];
                }
            }
            [window close];
            return failed ? 1 : 0;
        } @catch (NSException *error) {
            fprintf(stderr, "%s\n", error.reason.UTF8String);
            return 1;
        }
    }
}
