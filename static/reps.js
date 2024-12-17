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
        url: "/get_reps"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        console.log(totalTime);
        alts = response
        $('#reps').hide();
        $.each(alts, function(i, alt) {
            var card = $(createCard(alt));
            $(card).appendTo('#reps').hide();
        })
        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();
        $('#reps').fadeIn(1000);
        $('#reps > article').each(function() {
            $(this).show();
        })
        $('#filterInput').keyup(function() {
            var searchTerm = $(this).val();
            $('[data-filter]').each(function() {
                if ($(this).data('filter').indexOf(searchTerm) == -1) {
                    $(this).hide();
                } else {
                    $(this).show();
                }
            });
        });      
        $('.reset-filter').on("click", function(){
            $('[data-filter]').each(function() {
                $(this).show();
            });
            $('#filterInput').val('');
        })
    })
})

function createCard(alt) {
    let altClass = alt.class.toLowerCase().replace(' ', '')
    let altFaction = alt.faction.toLowerCase()
    altLevel = ''
    if (alt.level < 70) {
        altLevel = `<p class="icon card-text level-icon ${altClass} ${altClass}-border">${ alt.level }</p>`
    }
    let card = `
    <article class="alt card ${altClass} ${altFaction}" style="background-image: url('${alt.main_image}')">    
        <div class="card-body">
            <h1 class="card-title ${altClass}">${ alt.name }</h1>
            <dl>
                <dt>Realm</dt>
                <dd>${ alt.realm }</dd>
            </dl>
    `
    $.each(alt.reps, function(i, rep) {
        progress = (rep.value / rep.max) * 100
        card += `
            <dl class="reputations" data-filter="${ rep.faction_name.toLowerCase() }">
                <dt>${ rep.faction_name }</dt>
                <dd class="flex ${ rep.standing_name.toLowerCase().replace(/ /g, "_") }"><div class="progress-bar"><span class="progress" style="width: ${ progress }%"></span></div>${ rep.standing_name }</dd>
            </dl>
        `
    })
    card += `
            <div class="card-footer">
                <p class="alt-id">${ alt.character_id }</p>
                <p class="last-login">${ alt.last_login }</p>
            </div>
            <div class="alt-icons">
                <img class="icon faction-icon ${altFaction}-icon" data-filter="${altFaction}" src="/static/images/${altFaction}.png" alt="${alt.faction} icon">
                <img class="icon class-icon" data-filter="${altClass}" src="/static/flatborder/${altClass}_flatborder.png" alt="${altClass} icon">
                ${altLevel}
            </div>
        </div>
    </article>
    `
    return card
}