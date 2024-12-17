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
        url: "/get_rares"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        // console.log(totalTime);
        rares = response
        var now = moment();
        var minutes = now.minutes();
        var diff = 30 - (minutes % 30);
        now.add(diff, 'minutes').startOf('minute');

        $('#rares').hide();
        $.each(rares, function(i, rare) {
            if (rare.name != 'skip') {
                var card = $(createCard(rare, now))
                $(card).appendTo('#rares').hide()
            }
            now.add(30, 'minutes')
        })
        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();
        $('#rares').fadeIn(1000);
        $('#rares > article').each(function() {
            $(this).show();
        })
        setInterval(function() {
            var first_rare = new Date($("#rares > article:first-child").data("timer"))
            var next_rare = new Date($("#rares > article:nth-child(2)").data("timer"))
            // var interval = Math.round((next_rare - first_rare) / 60000);
            var now = new Date()
            var cycle = 810
            // console.log("1st: " + first_rare)
            // console.log("2nd: " + next_rare)
            // console.log("now: " + now)

            if (now > first_rare) {
                // console.log("update")
                $("#rares > article:first-child").clone().appendTo("#rares")
                $("#rares > article:first-child").remove()
                last_rare = new Date(first_rare.setMinutes(first_rare.getMinutes() + cycle))
                // console.log("last: " + last_rare)
                parts = extractDateTimeParts(last_rare)
                $("#rares > article:last-child").data("timer", parts.month + "/" + parts.day + "/" + parts.year + " " + parts.hour + ":" + parts.minutes)
                $("#rares > article:last-child > div > h1").text(parts.hour + ":" + parts.minute)
        }
        }, 10000);        
    })
})

function createCard(rare, now) {
    var rareDate = now.format("MM/DD/YY")
    var rareTime = now.format("HH:mm");
    let card = `
    <article class="rare card" data-timer="${ rareDate + " " + rareTime }">    
        <div class="card-body flex">
            <h1 class="card-title">${ rareTime }</h1>
            <h2><a href="${ rare.link }" target="_blank">${ rare.name }</a></h2>
            <p class="location">${ rare.location }</p>
        </div>
    </article>
    `
    return card
}

function extractDateTimeParts(date) {
    var parts = {};
    parts.year = date.getFullYear().toString().substr(-2)
    parts.month = date.getMonth() + 1
    parts.month = parts.month.toString().padStart(2, '0')
    parts.day = date.getDate().toString().padStart(2, '0')
    parts.hour = date.getHours().toString().padStart(2, '0')
    parts.minute = date.getMinutes().toString().padStart(2, '0')
    parts.second = date.getSeconds().toString().padStart(2, '0')
    return parts
}

function hasDST(date = new Date()) {
    const noDST = new Date(date.getFullYear(), 0, 1).getTimezoneOffset(); // 360
    const DST = new Date(date.getFullYear(), 6, 1).getTimezoneOffset(); // 300
    const current = date.getTimezoneOffset()
    console.log(DST)
    console.log(current)
    if (current == DST) {
        return true
    } else {
        return false
    }
  }
  
  // 👇️ 19th of February 2023
  console.log(hasDST(new Date(2023, 1, 19))); // 👉️ false
  
  // 👇️ 12th of March 2023
  console.log(hasDST(new Date())); // 👉️ true