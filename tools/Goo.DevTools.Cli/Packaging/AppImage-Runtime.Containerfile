FROM docker.io/library/alpine:3.21@sha256:2d8a11041a92082ba21e364dec73559ce44f1de69b60fa68315f6d3774e59117 AS build
RUN apk add --no-cache \
    autoconf=2.72-r0 automake=1.17-r0 bash=5.2.37-r0 binutils=2.43.1-r3 \
    brotli-libs=1.1.1-r0 build-base=0.5-r3 c-ares=1.34.9-r0 clang19=19.1.4-r0 \
    clang19-headers=19.1.4-r0 clang19-libs=19.1.4-r0 curl=8.14.1-r3 file=5.46-r2 \
    fortify-headers=1.1-r5 g++=14.2.0-r4 gcc=14.2.0-r4 gdbm=1.24-r0 \
    gmp=6.3.0-r2 isl26=0.26-r1 jansson=2.14-r4 libatomic=14.2.0-r4 \
    libbz2=1.0.8-r6 libcurl=8.14.1-r3 libexpat=2.10.0-r0 libffi=3.4.7-r0 \
    libgcc=14.2.0-r4 libgomp=14.2.0-r4 libidn2=2.3.7-r0 libltdl=2.4.7-r3 \
    libmagic=5.46-r2 libncursesw=6.5_p20241006-r3 libpanelw=6.5_p20241006-r3 \
    libpsl=0.21.5-r3 libstdc++=14.2.0-r4 libstdc++-dev=14.2.0-r4 \
    libtool=2.4.7-r3 libunistring=1.2-r0 libxml2=2.13.9-r1 linux-headers=6.6-r1 \
    llvm19-libs=19.1.4-r1 llvm19-linker-tools=19.1.4-r1 m4=1.4.19-r3 make=4.4.1-r2 \
    meson=1.6.1-r0 meson-pyc=1.6.1-r0 mimalloc2=2.1.7-r0 mimalloc2-debug=2.1.7-r0 \
    mimalloc2-dev=2.1.7-r0 mimalloc2-insecure=2.1.7-r0 mpc1=1.3.1-r1 mpdecimal=4.0.0-r0 \
    mpfr4=4.2.1-r0 musl=1.2.5-r12 musl-dev=1.2.5-r12 ncurses-terminfo-base=6.5_p20241006-r3 \
    nghttp2-libs=1.69.0-r0 patch=2.7.6-r10 perl=5.40.4-r0 pkgconf=2.3.0-r0 pyc=3.12.16-r0 \
    python3=3.12.16-r0 python3-pyc=3.12.16-r0 python3-pycache-pyc0=3.12.16-r0 \
    readline=8.2.13-r0 samurai=1.2-r6 sqlite-libs=3.48.0-r4 xz=5.8.4-r0 xz-libs=5.8.4-r0 \
    zlib=1.4-r0 zlib-dev=1.4-r0 zlib-static=1.4-r0 \
    zstd=1.5.6-r2 zstd-dev=1.5.6-r2 zstd-libs=1.5.6-r2 zstd-static=1.5.6-r2
ENV SOURCE_DATE_EPOCH=0 MAKEFLAGS=-j2 CMAKE_BUILD_PARALLEL_LEVEL=2
WORKDIR /build
RUN curl -fL https://codeload.github.com/AppImage/type2-runtime/tar.gz/fedfad51acc2860b2916a1eef32ba4a500ff31ef -o runtime.tar.gz \
    && echo 'e27ea3c837e9c660e1a9a2993b673ae93bbb53077330efba8654031e302d4e8e  runtime.tar.gz' | sha256sum -c - \
    && tar xf runtime.tar.gz --strip-components=1 \
    && curl -fL https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz -o fuse-3.15.0.tar.xz \
    && echo '70589cfd5e1cff7ccd6ac91c86c01be340b227285c5e200baa284e401eea2ca0  fuse-3.15.0.tar.xz' | sha256sum -c - \
    && tar xf fuse-3.15.0.tar.xz \
    && cd fuse-3.15.0 \
    && patch -p1 < ../patches/libfuse/mount.c.diff \
    && CFLAGS=-ffile-prefix-map=/build=. meson setup build --prefix=/usr --default-library=static -Dexamples=false -Dtests=false -Dutils=false -Dudevrulesdir=/tmp \
    && ninja -C build -j2 install
RUN curl -fL https://codeload.github.com/vasi/squashfuse/tar.gz/refs/tags/0.5.2 -o squashfuse.tar.gz \
    && echo 'db0238c5981dabbd80ee09ae15387f390091668ca060a7bc38047912491443d3  squashfuse.tar.gz' | sha256sum -c - \
    && tar xf squashfuse.tar.gz \
    && cd squashfuse-0.5.2 \
    && ./autogen.sh \
    && CFLAGS='-ffunction-sections -fdata-sections -Os -ffile-prefix-map=/build=.' ./configure LDFLAGS=-static --without-lzma --without-lzo --without-lz4 \
    && make && make install \
    && install -m644 ./*.h /usr/local/include/squashfuse/
RUN cd src/runtime \
    && make CC='clang -save-temps=obj' runtime \
    && mkdir -p /out /relink \
    && cp runtime.o data_sections.ld /relink/ \
    && cp /usr/local/lib/libsquashfuse*.a /usr/lib/libzstd.a /usr/lib/libz.a /usr/lib/libfuse3.a /usr/lib/libmimalloc.a /relink/ \
    && cp /build/runtime.tar.gz /build/fuse-3.15.0.tar.xz /relink/ \
    && cp /build/patches/libfuse/mount.c.diff /relink/ \
    && strip --strip-debug --strip-unneeded runtime \
    && printf 'AI\002' | dd of=runtime bs=1 count=3 seek=8 conv=notrunc \
    && cp runtime /out/runtime-x86_64 \
    && touch -t 197001010000 /relink /relink/* \
    && tar -czf /out/runtime-x86_64-relink.tar.gz -C /relink .
FROM scratch
COPY --from=build /out/ /
