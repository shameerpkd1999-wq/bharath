# BharatYatra Flutter Mobile Application Setup Guide

This directory contains the complete source code for migrating the Next.js Trip Planner web application into a premium, native Android (and iOS) mobile application using **Flutter & Dart**.

---

## 🛠️ Step 1: Install the Flutter SDK

Since the Flutter command isn't currently recognized in your terminal, follow these steps to install the SDK on Windows:

1. **Download the Flutter SDK**:
   - Go to [flutter.dev/docs/get-started/install/windows](https://docs.flutter.dev/get-started/install/windows) and download the latest stable SDK zip file.
2. **Extract the files**:
   - Extract the zip file and place it in a path without spaces (e.g. `C:\src\flutter`).
3. **Update your Path environment variable**:
   - Open search on Windows, type `env`, select **Edit the system environment variables**.
   - Under **User variables**, select `Path` and click **Edit**.
   - Click **New** and add the path to Flutter's bin directory: `C:\src\flutter\bin`.
   - Click **OK** to save.
4. **Verify installation**:
   - Open a fresh PowerShell/CMD terminal and run:
     ```bash
     flutter doctor
     ```
   - This command check your system environment and tells you if you need to install Android Studio, Java Development Kit, or Android licenses.

---

## 📱 Step 2: Set Up Android Studio & Emulator

1. Download and install **Android Studio** from [developer.android.com/studio](https://developer.android.com/studio).
2. During setup, make sure to install:
   - **Android SDK Platform**
   - **Android SDK Command-line Tools**
   - **Android Virtual Device (Emulator)**
3. Open Android Studio, go to **Virtual Device Manager** (Device Manager), create a virtual phone device, and run the emulator.

---

## 📁 Step 3: Initialize the Project Template

Because these Dart source files are already written for you in this directory, you just need to initialize the underlying Android framework wrapper.

1. Open a terminal inside the main folder `e:\project\bharath_flutter`:
   ```bash
   flutter create . --org com.bharatyatra --project-name bharath_flutter
   ```
   *Note: This command will safely generate the native `/android`, `/ios`, and build configuration folders without overwriting the `/lib` or `pubspec.yaml` files we created.*

2. Run a package fetch to fetch all dependencies:
   ```bash
   flutter pub get
   ```

---

## 🔥 Step 4: Configure Firebase for Android

On mobile devices, Firebase requires a configuration JSON file to authenticate native SDK requests.

1. Go to your **[Firebase Console](https://console.firebase.google.com)**.
2. Open your project.
3. Click **Add App** and select **Android**.
4. Enter the package name: `com.bharatyatra.bharath_flutter` (or match the package name in `android/app/build.gradle`).
5. Download the configuration file: **`google-services.json`**.
6. Place this file inside the Android app directory at:
   `bharath_flutter/android/app/google-services.json`

---

## 🔑 Step 5: Configure your Gemini API Key

We configured the app to load your Gemini API Key via standard Flutter compiler environment variables:

1. Run the application passing your API key as a target compiler argument:
   ```bash
   flutter run --dart-define=GEMINI_API_KEY="YOUR_ACTUAL_API_KEY_HERE"
   ```

*(If you run the app without a key, it will automatically heal and fallback to high-fidelity offline mock regional itineraries just like the web app).*
