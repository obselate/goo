#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>

@interface CGVirtualDisplayDescriptor : NSObject
@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@property(nonatomic) unsigned int serialNumber;
@property(strong, nonatomic) NSString *name;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGPoint redPrimary;
@property(nonatomic) CGPoint greenPrimary;
@property(nonatomic) CGPoint bluePrimary;
@property(nonatomic) CGPoint whitePoint;
@property(strong, nonatomic) id queue;
@end

@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) unsigned int displayID;
- (id)initWithDescriptor:(id)descriptor;
- (BOOL)applySettings:(id)settings;
@end

@interface CGVirtualDisplayMode : NSObject
- (id)initWithWidth:(unsigned int)width height:(unsigned int)height refreshRate:(double)rate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(strong, nonatomic) NSArray *modes;
@property(nonatomic) unsigned int hiDPI;
@end

static CGVirtualDisplay *profileDisplay;

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) return 1;
        [NSApplication sharedApplication];
        CGDirectDisplayID target = CGMainDisplayID();
        CFArrayRef modes = CGDisplayCopyAllDisplayModes(target, NULL);
        BOOL configured = NO;
        for (CFIndex index = 0; index < CFArrayGetCount(modes); index++) {
            CGDisplayModeRef mode = (CGDisplayModeRef)CFArrayGetValueAtIndex(modes, index);
            size_t width = CGDisplayModeGetWidth(mode);
            size_t height = CGDisplayModeGetHeight(mode);
            fprintf(stdout, "macos-display-mode: width=%zu height=%zu pixels_width=%zu pixels_height=%zu\n",
                width, height, CGDisplayModeGetPixelWidth(mode), CGDisplayModeGetPixelHeight(mode));
            if (!configured && width >= 2700 && height >= 1700 &&
                width == CGDisplayModeGetPixelWidth(mode) && height == CGDisplayModeGetPixelHeight(mode)) {
                configured = CGDisplaySetDisplayMode(target, mode, NULL) == kCGErrorSuccess;
            }
        }
        CFRelease(modes);
        if (!configured) {
            CGVirtualDisplayDescriptor *descriptor = [CGVirtualDisplayDescriptor new];
            descriptor.name = @"Goo atlas publication display";
            descriptor.vendorID = 505;
            descriptor.productID = 273;
            descriptor.serialNum = 27301;
            descriptor.serialNumber = 27301;
            descriptor.queue = dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0);
            descriptor.maxPixelsWide = 2880;
            descriptor.maxPixelsHigh = 1800;
            descriptor.sizeInMillimeters = CGSizeMake(672, 420);
            descriptor.whitePoint = CGPointMake(0.3125, 0.3291);
            descriptor.redPrimary = CGPointMake(0.6797, 0.3203);
            descriptor.greenPrimary = CGPointMake(0.2559, 0.6983);
            descriptor.bluePrimary = CGPointMake(0.1494, 0.0557);
            profileDisplay = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];
            CGVirtualDisplaySettings *settings = [CGVirtualDisplaySettings new];
            settings.hiDPI = 0;
            settings.modes = @[[[CGVirtualDisplayMode alloc] initWithWidth:2880 height:1800 refreshRate:60]];
            if (!profileDisplay || ![profileDisplay applySettings:settings]) {
                fprintf(stderr, "macos-profile-display: virtual display unavailable\n");
                return 2;
            }
            CGDisplayConfigRef configuration;
            if (CGBeginDisplayConfiguration(&configuration) != kCGErrorSuccess) return 3;
            CGConfigureDisplayOrigin(configuration, target, -1024, 0);
            target = profileDisplay.displayID;
            CGConfigureDisplayOrigin(configuration, target, 0, 0);
            if (CGCompleteDisplayConfiguration(configuration, kCGConfigureForAppOnly) != kCGErrorSuccess) return 4;
        }
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
        while (CGMainDisplayID() != target || CGDisplayPixelsWide(target) < 2700 || CGDisplayPixelsHigh(target) < 1700) {
            if ([deadline timeIntervalSinceNow] <= 0) return 5;
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
        }
        fprintf(stdout, "macos-profile-display: width=%zu height=%zu\n", CGDisplayPixelsWide(target), CGDisplayPixelsHigh(target));
        fflush(stdout);
        NSTask *task = [NSTask new];
        task.executableURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        task.arguments = @[[NSString stringWithUTF8String:argv[2]]];
        NSError *error;
        if (![task launchAndReturnError:&error]) {
            fprintf(stderr, "macos-profile-display: %s\n", error.localizedDescription.UTF8String);
            return 6;
        }
        [task waitUntilExit];
        return task.terminationStatus;
    }
}
