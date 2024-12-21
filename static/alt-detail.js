$(document).ready(function(){
    var ajaxTime= Date.now();
    var secs = 0;
    var mins = 0;
    $('.load-timer').html(secs + 's');
    var timer = setInterval(function () {
        secs = secs + 1;
        if (secs > 59) {
        mins = mins + 1;
        secs = 0;
        }
        $('.load-timer').html(secs + 's');
    },1000);
    $.ajax({
        type: "POST",
        url: "/get_alt_details"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        console.log(totalTime);
        details = response[0]

        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();
        $('#details').fadeIn(1000);
        $('#details > article').each(function() {
            $(this).show();
        })
    })
})


$("a[href='#top']").click(function() {
    $('html, body').animate({ scrollTop: 0 }, 1200);
        return false;
});