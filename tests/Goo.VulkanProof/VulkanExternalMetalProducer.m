#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import <CoreVideo/CoreVideo.h>
#import <IOSurface/IOSurface.h>
#include <stdint.h>
#include <stdio.h>

@interface GooExternalMetalProducer : NSObject {
@public
    id<MTLDevice> device;
    id<MTLTexture> texture;
    id<MTLSharedEvent> ready;
    id<MTLSharedEvent> gate;
    id<MTLCommandBuffer> command;
    id<MTLBuffer> staging;
    CVPixelBufferRef pixels;
    CVMetalTextureCacheRef cache;
    CVMetalTextureRef image;
    int releaseCount;
}
- (instancetype)initWithDevice:(id<MTLDevice>)value;
- (BOOL)complete;
- (void)dropTexture;
- (void)releaseFrame;
@end

@implementation GooExternalMetalProducer
- (instancetype)initWithDevice:(id<MTLDevice>)value {
    self = [super init];
    if (!self) return nil;
    device = value;
    NSDictionary *attributes = @{(__bridge id)kCVPixelBufferIOSurfacePropertiesKey: @{},
                                 (__bridge id)kCVPixelBufferMetalCompatibilityKey: @YES};
    CVReturn result = CVPixelBufferCreate(kCFAllocatorDefault, 8, 4, kCVPixelFormatType_32BGRA,
                                         (__bridge CFDictionaryRef)attributes, &pixels);
    if (result != kCVReturnSuccess) {
        fprintf(stderr, "CVPixelBufferCreate: %d\n", result);
        return nil;
    }
    result = CVMetalTextureCacheCreate(kCFAllocatorDefault, NULL, device, NULL, &cache);
    if (result != kCVReturnSuccess) return nil;
    result = CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pixels, NULL,
                                                       MTLPixelFormatBGRA8Unorm_sRGB, 8, 4, 0, &image);
    if (result != kCVReturnSuccess) {
        fprintf(stderr, "CVMetalTextureCacheCreateTextureFromImage: %d\n", result);
        return nil;
    }
    texture = CVMetalTextureGetTexture(image);
    ready = [device newSharedEvent];
    gate = [device newSharedEvent];
    staging = [device newBufferWithLength:1024 options:MTLResourceStorageModeShared];
    if (!texture || !ready || !gate || !staging) return nil;
    uint8_t *bytes = staging.contents;
    for (int y = 0; y < 4; ++y) {
        for (int x = 0; x < 8; ++x) {
            uint8_t *pixel = bytes + y * 256 + x * 4;
            pixel[0] = y >= 2 && x < 4 ? 255 : 0;
            pixel[1] = x >= 4 ? 255 : 0;
            pixel[2] = (y < 2 && x < 4) || (y >= 2 && x >= 4) ? 255 : 0;
            pixel[3] = 0;
        }
    }
    id<MTLCommandQueue> queue = [device newCommandQueue];
    command = [queue commandBuffer];
    if (!command) return nil;
    [command encodeWaitForEvent:gate value:1];
    id<MTLBlitCommandEncoder> encoder = [command blitCommandEncoder];
    [encoder copyFromBuffer:staging sourceOffset:0 sourceBytesPerRow:256 sourceBytesPerImage:1024
                 sourceSize:MTLSizeMake(8, 4, 1) toTexture:texture destinationSlice:0
           destinationLevel:0 destinationOrigin:MTLOriginMake(0, 0, 0)];
    [encoder endEncoding];
    [command encodeSignalEvent:ready value:1];
    [command commit];
    return self;
}

- (BOOL)complete {
    gate.signaledValue = 1;
    [command waitUntilCompleted];
    if (command.status != MTLCommandBufferStatusCompleted) {
        fprintf(stderr, "Metal producer command failed: %s\n", command.error.localizedDescription.UTF8String);
        return NO;
    }
    command = nil;
    staging = nil;
    return YES;
}

- (void)dropTexture {
    texture = nil;
    if (image) { CFRelease(image); image = NULL; }
    if (cache) { CVMetalTextureCacheFlush(cache, 0); CFRelease(cache); cache = NULL; }
}

- (void)releaseFrame {
    if (!pixels) return;
    [self dropTexture];
    CVPixelBufferRelease(pixels);
    pixels = NULL;
    releaseCount++;
}

- (void)dealloc {
    if (command) { [self complete]; }
    [self releaseFrame];
}
@end

void *goo_external_metal_create(void *device) {
    @autoreleasepool {
        GooExternalMetalProducer *producer = [[GooExternalMetalProducer alloc] initWithDevice:(__bridge id<MTLDevice>)device];
        return (__bridge_retained void *)producer;
    }
}

void *goo_external_metal_texture(void *value) {
    return (__bridge void *)((__bridge GooExternalMetalProducer *)value)->texture;
}

void *goo_external_metal_surface(void *value) {
    return CVPixelBufferGetIOSurface(((__bridge GooExternalMetalProducer *)value)->pixels);
}

void *goo_external_metal_event(void *value) {
    return (__bridge void *)((__bridge GooExternalMetalProducer *)value)->ready;
}

int32_t goo_external_metal_complete(void *value) {
    @autoreleasepool { return [(__bridge GooExternalMetalProducer *)value complete] ? 1 : 0; }
}

void goo_external_metal_drop_texture(void *value) {
    @autoreleasepool { [(__bridge GooExternalMetalProducer *)value dropTexture]; }
}

void goo_external_metal_release_frame(void *value) {
    @autoreleasepool { [(__bridge GooExternalMetalProducer *)value releaseFrame]; }
}

int32_t goo_external_metal_release_count(void *value) {
    return ((__bridge GooExternalMetalProducer *)value)->releaseCount;
}

void goo_external_metal_destroy(void *value) {
    @autoreleasepool {
        id producer = (__bridge_transfer id)value;
        (void)producer;
    }
}
