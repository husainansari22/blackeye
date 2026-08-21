<?php
/**
 * Copy this file to config.php and fill in your Hostinger MySQL details.
 * Never upload config.php to a public GitHub repo.
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'u343769360_acctventa',
    // Copy exact username from Hostinger → MySQL Databases (may match DB name)
    'db_user' => 'u343769360_acctventa_',
    'db_pass' => 'CHANGE_ME',
    'db_charset' => 'utf8mb4',

    // Owner admin (website control panel)
    'owner_username' => 'owner',
    'owner_password' => 'ChangeThisOwnerPass1!',

    // Platform defaults (can also be edited in Owner Admin)
    'min_deposit' => 3,
    'min_withdraw' => 5,
    'withdraw_commission_rate' => 0.10,
    'deposit_fee_rate' => 0,
    'free_daily_uploads' => 5,

    'app_name' => 'Acctventa',
    'app_url' => 'https://acctventa.com',
    'currency' => 'USD',
    'support_telegram' => 'https://t.me/acctventa',
    'support_email' => 'help@acctventa.com',

    // Create this mailbox in Hostinger → Emails first
    'mail_from' => 'help@acctventa.com',
    'mail_from_name' => 'Acctventa',
];
