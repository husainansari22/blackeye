<?php
/**
 * Copy this file to config.php and fill in your Hostinger MySQL details.
 * Never upload config.php to a public GitHub repo.
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'u343769360_acctsuite',
    // Copy exact username from Hostinger → MySQL Databases (may match DB name)
    'db_user' => 'u343769360_acctsuite',
    'db_pass' => 'CHANGE_ME',
    'db_charset' => 'utf8mb4',

    // Owner admin (website control panel)
    'owner_username' => 'owner',
    'owner_password' => 'ChangeThisOwnerPass1!',

    // Platform defaults (can also be edited in Owner Admin)
    'min_deposit' => 3,
    'min_withdraw' => 5,
    'withdraw_commission_rate' => 0.10,
    'sales_commission_rate' => 0.22,
    'referral_reward_amount' => 5,
    'referral_min_deposit' => 50,
    'deposit_fee_rate' => 0,
    'free_daily_uploads' => 5,

    'app_name' => 'AcctSuite',
    'app_url' => 'https://acctsuite.com',
    'currency' => 'USD',
    'payment_currency' => 'NGN',
    'usd_ngn_rate' => 1600,
    'support_telegram' => 'https://t.me/acctsuite',
    'support_email' => 'support@acctsuite.com',

    // Create this mailbox in Hostinger → Emails first
    'mail_from' => 'support@acctsuite.com',
    'mail_from_name' => 'AcctSuite',
];
