<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/hello', function () {
    return response()->json([
        'status' => 'success',
        'message' => 'Hello World'
    ]);
});
