package com.gofolyx.mobile.deepar

import android.content.Context
import com.gofolyx.mobile.BuildConfig

/**
 * Accès à la clé de licence DeepAR (issue de local.properties -> BuildConfigField,
 * voir app/build.gradle) — jamais commitée en dur dans le code.
 */
object BuildConfigAccessor {
    fun deepArLicenseKey(context: Context): String = BuildConfig.DEEPAR_LICENSE_KEY
}
