$(document).ready(function () {

  // Open profile modal
  $('#profile-btn').on('click', function (e) {
    e.preventDefault();

    $('#modal-body').html('<p>Loading...</p>');
    $('.modal-window').addClass('profile');
    $('#modal-overlay').fadeIn();

    $.ajax({
      type: 'GET',
      url: '/profile',
      success: function (response) {
        $('#modal-body').html(response.html || '<p>Could not load profile.</p>');
      },
      error: function () {
        $('#modal-body').html('<p>Error loading profile.</p>');
      }
    });
  });

  // Logout: clear battle.net SSO cookie via hidden image before navigating to /logout
  $(document).on('click', '.btn-logout', function (e) {
    e.preventDefault();
    var img = new Image();
    img.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
    img.onload = img.onerror = function () {
      window.location.href = '/logout';
    };
    document.body.appendChild(img);
    img.src = 'https://battle.net/login/logout';
  });

  // Save account visibility preference on toggle change (delegated)
  $(document).on('change', '.account-toggle', function () {
    var hiddenAccounts = [];
    $('.account-toggle').each(function () {
      if (!$(this).is(':checked')) {
        hiddenAccounts.push(parseInt($(this).data('account-id'), 10));
      }
    });

    $.ajax({
      type: 'POST',
      url: '/save_preferences',
      contentType: 'application/json',
      data: JSON.stringify({ hidden_accounts: hiddenAccounts }),
      success: function () {
        $(document).trigger('accountsChanged', [hiddenAccounts]);
      }
    });
  });

});
