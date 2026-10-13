#!/bin/bash
# Membangun PortalFTTH.apk tanpa Android SDK (cukup JDK 17+, Python 3 + Pillow tidak perlu).
# Alat diunduh dari Maven Central: apktool (berisi aapt2 + framework Android), dalvik-dx, apksig, android-all.
# Pakai: ./build.sh /path/keystore.jks /path/file-password.txt
set -euo pipefail
cd "$(dirname "$0")"
KS=${1:?keystore}; PWF=${2:?file password}
T=.tools; M=https://repo.maven.apache.org/maven2; mkdir -p $T
get() { [ -f "$T/$(basename $1)" ] || curl -sSfL -o "$T/$(basename $1)" "$M/$1"; }
get org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar
get com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar
get com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar
get org/robolectric/android-all/15-robolectric-12650502/android-all-15-robolectric-12650502.jar
[ -x $T/prebuilt/linux/aapt2 ] || (cd $T && unzip -o -q apktool-cli-3.0.3.jar prebuilt/linux/aapt2 prebuilt/android-framework.jar && chmod +x prebuilt/linux/aapt2)
rm -rf out; mkdir -p out/flat out/cls out/dex
$T/prebuilt/linux/aapt2 compile --dir res -o out/flat/res.zip
$T/prebuilt/linux/aapt2 link -o out/base.apk -I $T/prebuilt/android-framework.jar --manifest AndroidManifest.xml --min-sdk-version 24 --target-sdk-version 34 out/flat/res.zip
javac -nowarn --release 8 -cp $T/android-all-15-robolectric-12650502.jar -d out/cls $(find src -name '*.java')
java -cp $T/dalvik-dx-16.0.1.jar com.android.dx.command.Main --dex --min-sdk-version=24 --output=out/dex/classes.dex out/cls
python3 align.py out/base.apk out/dex/classes.dex out/unsigned.apk
javac -nowarn -cp $T/apksig-2.3.0.jar -d out signer/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED \
  -cp $T/apksig-2.3.0.jar:out Sign "$KS" "$PWF" out/unsigned.apk out/PortalFTTH.apk
echo "Selesai: android/out/PortalFTTH.apk"
