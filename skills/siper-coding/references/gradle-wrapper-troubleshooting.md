# Gradle Wrapper 故障排除

## wrapper jar 缺失

当 `services.gradle.org` 和 `raw.githubusercontent.com` 均不可达时：

### 方案 A：本地 zip + wrapper（推荐）
1. 从腾讯云镜像下载：`curl -L -o /tmp/gradle-8.14.3-all.zip "https://mirrors.cloud.tencent.com/gradle/gradle-8.14.3-all.zip"`
2. 修改 `gradle-wrapper.properties`：
   ```properties
   distributionUrl=file\:///tmp/gradle-8.14.3-all.zip
   validateDistributionUrl=false
   ```

### 方案 B：直接用本地 gradle 二进制
当 wrapper jar 也无法下载时：
```bash
# 找到已安装的 gradle
ls ~/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle

# 直接使用
export GRADLE_HOME=~/.gradle/wrapper/dists/gradle-8.14.3-all/<hash>/gradle-8.14.3
export PATH=$GRADLE_HOME/bin:$PATH
gradle assembleDebug --no-daemon
```

## Kotlin 版本冲突

`Duplicate class kotlin.io.path.PathsKt found in modules kotlin-stdlib-1.8.22 and kotlin-stdlib-jdk8-1.6.0`

修复：在 `app/build.gradle` 中添加：
```groovy
configurations.all {
    resolutionStrategy {
        force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.22'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.22'
    }
}
```
