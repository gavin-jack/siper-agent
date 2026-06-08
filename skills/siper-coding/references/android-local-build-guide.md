# Android APK 本地构建指南

## 概述

本文档记录在 WSL2 本地构建 SiPer Android APK 的完整流程和陷阱。
与 GitHub Actions 构建不同，本地构建需要手动准备 JDK、Android SDK 和 Gradle。

## 环境要求

| 组件 | 版本 | 用途 |
|------|------|------|
| JDK | 21 | capacitor-android 编译需要 |
| Android SDK | compileSdk 34 | Android 平台 |
| Build Tools | 34.0.0 | aapt2/d8 等工具 |
| Platform Tools | 最新 | adb/fastboot |
| NDK | 25.2.9519653 | Chaquopy Python 编译 |
| Gradle | 8.14.3 | 构建系统 |

## 安装步骤

### 1. JDK 21

Oracle CDN 下载可用（adoptium API 有重定向问题）：

```bash
curl -L "https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz" -o /tmp/jdk21.tar.gz
cd /tmp && tar xzf jdk21.tar.gz
mv /tmp/jdk-21.* ~/jdk/jdk-21
~/jdk/jdk-21/bin/java -version
```

**陷阱**：adoptium API 返回 307 重定向，curl 不加 `-L` 只下载 9 字节。Oracle CDN 更可靠。

### 2. Android SDK

```bash
export ANDROID_HOME=~/android-sdk
export JAVA_HOME=~/jdk/jdk-21
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

yes | sdkmanager --install \
  "platform-tools" \
  "build-tools;34.0.0" \
  "platforms;android-34" \
  "ndk;25.2.9519653"
```

### 3. Gradle 8.14.3

**关键问题**：`services.gradle.org` 从 WSL 访问超时（SSL read timeout）。

**解决方案**：从国内镜像下载后使用本地文件：

```bash
curl -L -o /tmp/gradle-8.14.3-all.zip \
  "https://mirrors.cloud.tencent.com/gradle/gradle-8.14.3-all.zip"
```

修改 `android/gradle/wrapper/gradle-wrapper.properties`：

```properties
distributionUrl=file\:///tmp/gradle-8.14.3-all.zip
validateDistributionUrl=false
```

**陷阱**：必须设置 `validateDistributionUrl=false`，否则 Gradle 拒绝本地文件。

### 4. local.properties

```bash
echo 'sdk.dir=/home/gavin/android-sdk' > ~/siper-mobile/android/local.properties
```

## 构建命令

```bash
export JAVA_HOME=~/jdk/jdk-21
export ANDROID_HOME=~/android-sdk
export PATH=$JAVA_HOME/bin:$PATH

cd ~/siper-mobile/android
./gradlew assembleDebug --no-daemon --stacktrace
```

**首次构建**约 5-10 分钟。

## 构建过程

1. **依赖下载**（~2 分钟）：AGP 8.13.0, AndroidX, Chaquopy 15.0.1
2. **Chaquopy Python 包安装**（~2 分钟）：为 arm64-v8a, armeabi-v7a, x86_64 分别安装
3. **Java/Kotlin 编译**（~1 分钟）：生成 DEX + SO 库
4. **APK 打包**：输出约 44MB

## 验证

```bash
ls -la android/app/build/outputs/apk/debug/app-debug.apk
cp android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Gavin/Desktop/siper-debug.apk
```

## 常见问题

- Gradle wrapper 超时 → 用本地 zip + `validateDistributionUrl=false`
- NDK 未找到 → `sdkmanager "ndk;25.2.9519653"`
- Java 版本错误 → 确保 JAVA_HOME 指向 JDK 21
- Chaquopy .pyc 编译警告 → 不影响使用，可忽略
