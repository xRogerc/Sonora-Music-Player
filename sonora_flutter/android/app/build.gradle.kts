plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.chaquo.python") version "17.0.0"
}

android {
    namespace = "com.sonora.sonora"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.sonora.sonora"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        ndk {
            abiFilters.clear()
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

chaquopy {
    defaultConfig {
        version = "3.12"
        buildPython("C:/Users/olive/Downloads/Projects/Python/MusicPlayer/backend/.venv/Scripts/python.exe")
        pip {
            install("django==5.2.17")
            install("djangorestframework==3.18.1")
            install("django-cors-headers")
            install("ytmusicapi==1.12.3")
            install("yt-dlp")
            install("requests")
            install("tzdata")
            install("asgiref==3.12.1")
            install("sqlparse==0.6.0")
            install("certifi")
        }
    }
}